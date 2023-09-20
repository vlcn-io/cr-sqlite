from crsql_correctness import connect
from pprint import pprint
import pytest

changes_query = "SELECT [table], [pk], [cid], [val] FROM crsql_changes"
changes_with_versions_query = "SELECT [table], [pk], [cid], [val], [db_version], [col_version] FROM crsql_changes"
full_changes_query = "SELECT [table], [pk], [cid], [val], [db_version], [col_version], [site_id] FROM crsql_changes"
clock_query = "SELECT rowid, __crsql_col_version, __crsql_db_version, __crsql_col_name, __crsql_site_id FROM todo__crsql_clock"


def test_c1_4_no_primary_keys():
    c = connect(":memory:")
    c.execute("create table foo (a)")
    with pytest.raises(Exception) as e_info:
        c.execute("select crsql_as_crr('foo')")


def test_c1_3_quoted_identifiers():
    c = connect(":memory:")
    c.execute("create table \"foo\" (a primary key not null)")
    c.execute("select crsql_as_crr('foo')")
    c.execute("create table `bar` (a primary key not null)")
    c.execute("select crsql_as_crr('bar')")
    c.execute("create table [baz] (a primary key not null)")
    c.execute("select crsql_as_crr('baz')")

    def check_clock(t): return c.execute(
        "SELECT rowid, __crsql_col_version, __crsql_db_version, __crsql_col_name, __crsql_site_id FROM {t}__crsql_clock".format(t=t)).fetchall()

    check_clock("foo")
    check_clock("bar")
    check_clock("baz")


def test_c1_c5_compound_primary_key():
    c = connect(":memory:")
    c.execute("create table foo (a not null, b not null, c, primary key (a, b))")
    c.execute("select crsql_as_crr('foo')")

    c.execute("SELECT a, b, __crsql_col_version, __crsql_col_name, __crsql_db_version, __crsql_site_id FROM foo__crsql_clock").fetchall()
    # with pytest.raises(Exception) as e_info:
    # c.execute("SELECT a__crsql_v FROM foo__crsql_crr").fetchall()


def test_c1_6_single_primary_key():
    c = connect(":memory:")
    c.execute("create table foo (a not null, b, c, primary key (a))")
    c.execute("select crsql_as_crr('foo')")
    c.execute("SELECT a, __crsql_col_version, __crsql_col_name, __crsql_db_version, __crsql_site_id FROM foo__crsql_clock").fetchall()


def test_c2_create_index():
    c = connect(":memory:")
    c.execute("create table foo (a primary key not null, b, c)")

    # TODO: create index is silent failing in some cases?
    c.execute("create index foo_idx on foo (b)")
    c.execute("select crsql_as_crr('foo')")
    idx_info = c.execute(
        "select * from pragma_index_info('foo_idx')").fetchall()

    # print(idx_info)


def setup_alter_test():
    c = connect(":memory:")
    c.execute("CREATE TABLE todo (id PRIMARY KEY NOT NULL, name, complete, list);")
    c.execute("SELECT crsql_as_crr('todo');")
    c.execute("INSERT INTO todo VALUES (1, 'cook', 0, 'home');")
    c.commit()
    return c


def test_drop_clock_on_col_remove():
    c = setup_alter_test()
    changes = c.execute(changes_query).fetchall()
    expected = [('todo', b'\x01\t\x01', 'name', 'cook'),
                ('todo', b'\x01\t\x01', 'complete', 0),
                ('todo', b'\x01\t\x01', 'list', 'home')]
    assert (changes == expected)

    clock_entries = c.execute(clock_query).fetchall()
    assert (clock_entries == [
        (1, 1, 1, 'name', None),
        (2, 1, 1, 'complete', None),
        (3, 1, 1, 'list', None)])

    c.execute("SELECT crsql_begin_alter('todo');")
    # Dropping a column should remove its entries from our replication logs.
    c.execute("ALTER TABLE todo DROP COLUMN list;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    expected = [
        ('todo', b'\x01\x09\x01', 'name', "cook"),
        ('todo', b'\x01\x09\x01', 'complete', 0),
    ]
    assert (changes == expected)

    clock_entries = c.execute(clock_query).fetchall()
    assert (
        clock_entries == [
            (1, 1, 1, 'name', None), (2, 1, 1, 'complete', None)]
    )


def test_backfill_col_add():
    # Nulls do not need a backfill given the row will
    # just be created in the target with null
    # Default value colums, by the same logic then, also
    # do not need a backfill.
    c = setup_alter_test()
    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo ADD COLUMN assignee;")
    c.execute("ALTER TABLE todo ADD COLUMN due_date DEFAULT '2018-01-01';")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()

    # We do _not_ backfill default values.
    # Given we only migrate against compatible schema versions there's no need to create
    # a record of a default value. The other node will have the same default or, if they wrote a value,
    # a value which takes precedence.
    assert (changes == [('todo', b'\x01\t\x01', 'name', 'cook'),
                        ('todo', b'\x01\t\x01', 'complete', 0),
                        ('todo', b'\x01\t\x01', 'list', 'home')])

    # we should be able to add entries
    c.execute(
        "INSERT INTO todo (id, name, complete, list, assignee) VALUES (2, 'clean', 0, 'home', 'me');")
    c.commit()
    changes = c.execute(changes_query).fetchall()
    assert (changes == [('todo', b'\x01\t\x01', 'name', 'cook'),
                        ('todo', b'\x01\t\x01', 'complete', 0),
                        ('todo', b'\x01\t\x01', 'list', 'home'),
                        ('todo', b'\x01\t\x02', 'name', 'clean'),
                        ('todo', b'\x01\t\x02', 'complete', 0),
                        ('todo', b'\x01\t\x02', 'list', 'home'),
                        ('todo', b'\x01\t\x02', 'assignee', 'me'),
                        ('todo', b'\x01\t\x02', 'due_date', '2018-01-01')])


def test_merging_columns_with_no_metadata():
    # This is the case where we do not create metadata records for certain
    # columns because they were only set to the default value.
    #
    # Merging should:
    # - always take a value if a value is present from a peer
    # - not do anything if the peer is at the same state
    None


def test_backfill_clocks_on_rename():
    # renaming a column should backfill the clock table with the new name
    # and drop entries for the old name
    # TODO: when we have our custom vtab for crr definnition
    # we can track renames directly.
    c = setup_alter_test()
    c.execute("INSERT INTO todo VALUES (2, 'clean', 0, 'home');")
    c.commit()
    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo RENAME name TO task;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()
    changes = c.execute(changes_with_versions_query).fetchall()
    assert (changes == [('todo', b'\x01\t\x01', 'complete', 0, 1, 1),
                        ('todo', b'\x01\t\x01', 'list', 'home', 1, 1),
                        ('todo', b'\x01\t\x01', 'task', 'cook', 2, 1),
                        ('todo', b'\x01\t\x02', 'complete', 0, 2, 1),
                        ('todo', b'\x01\t\x02', 'task', 'clean', 2, 1),
                        ('todo', b'\x01\t\x02', 'list', 'home', 2, 1)])


def test_delete_sentinels_not_lost():
    c = setup_alter_test()
    c.execute("DELETE FROM todo WHERE id = 1;")
    c.commit()
    changes = c.execute(changes_with_versions_query).fetchall()
    # starting off correctly
    assert (changes == [('todo', b'\x01\t\x01', '-1', None, 2, 2)])

    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo RENAME name TO task;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()

    changes = c.execute(changes_with_versions_query).fetchall()
    assert (changes == [('todo', b'\x01\x09\x01', '-1', None, 2, 2)])


def test_pk_only_sentinels():
    c = connect(":memory:")
    c.execute("CREATE TABLE assoc (id1 NOT NULL, id2 NOT NULL, PRIMARY KEY (id1, id2));")
    c.execute("SELECT crsql_as_crr('assoc');")
    c.execute("INSERT INTO assoc VALUES (1, 2);")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    assert (
        changes == [('assoc', b'\x02\x09\x01\x09\x02', '-1', None)])

    c.execute("SELECT crsql_begin_alter('assoc');")
    c.execute("ALTER TABLE assoc ADD COLUMN data;")
    c.execute("SELECT crsql_commit_alter('assoc');")
    c.commit()

    # Sentinels are still retained after the alter
    changes = c.execute(changes_query).fetchall()
    assert (
        changes == [('assoc', b'\x02\x09\x01\x09\x02', '-1', None)])


# Get a sentinel for PK only table
# Remove pk column? Impossible in SQLite, right?

# TODO: property based test to flip through different number of cols, col types,
# differing amounts of rows, differing number of pk columns, etc.


def test_backfill_existing_data():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("INSERT INTO foo VALUES (2, 'baz');")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.commit()

    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'name', 'bar'),
                        ('foo', b'\x01\t\x02', 'name', 'baz'),
                        ('foo', b'\x01\t\x03', 'name', None)])


# This creates table which have existing data.
# Converting a table that already has data to a `crr` should:
# 1. backfill metadata for existing row
# 2. that backfilled metadata should get the _next_ db version assigned to it
def test_backfill_moves_dbversion():
    c = connect(":memory:")
    # First table which'll get db_version 1 for all rows backfilled
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("INSERT INTO foo VALUES (2, 'baz');")
    c.commit()

    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    # Next table which should get db_Version 2 for all rows backfilled
    c.execute("CREATE TABLE bar (id PRIMARY KEY NOT NULL, name);")
    c.execute("INSERT INTO bar VALUES (1, 'bar');")
    c.execute("INSERT INTO bar (id) VALUES (3);")

    c.execute("SELECT crsql_as_crr('bar');")
    c.commit()

    changes = c.execute(changes_with_versions_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'name', 'bar', 1, 1),
                        ('foo', b'\x01\t\x02', 'name',
                         'baz', 1, 1),  # db version 1
                        # db version 2
                        ('bar', b'\x01\t\x01', 'name', 'bar', 2, 1),
                        ('bar', b'\x01\t\x03', 'name', None, 2, 1)])


# Similar to the above test but checks that `crsql_alter` does the right thing.
# See comments on create_clock_rows_from_stmt on why we don't bump db version
# on alter commit.
def test_backfill_for_alter_does_not_move_dbversion():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    # - change name to have a default value
    # - add an age column (nullable)
    # - add a row with a name and age
    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY NOT NULL, name TEXT DEFAULT 'none', age INTEGER DEFAULT NULL);")
    # copy over old data
    c.execute("INSERT INTO new_foo (id, name) SELECT id, name FROM foo;")
    # insert a new row during the migration
    c.execute("INSERT INTO new_foo (id, name, age) VALUES (2, 'baz', 33);")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    # now:
    # - check that the old row has the old db_version
    # - check that the new row has the new db_version
    # - check that the old row has the old site_id <-- this case isn't covered yet. Need to do a merge.
    # - check that the new row has a null siteid
    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [
            # Existing rows have their existing db_version (1).
            # New rows get the current db version given
            # migrations on other will create convergence.
            ('foo', b'\x01\t\x01', 'name', 'bar', 1, 1, None),
            ('foo', b'\x01\t\x02', 'name', 'baz', 1, 1, None),
            ('foo', b'\x01\t\x02', 'age', 33, 1, 1, None)])


def test_add_col_with_default():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER DEFAULT 0;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    # No change given we only added a column with a default value and we need
    # not backfill default values
    assert (changes == [('foo', b'\x01\t\x01', 'name', 'bar', 1, 1, None)])

    None


def test_add_col_nullable():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER DEFAULT NULL;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'name', 'bar', 1, 1, None)])


def test_add_col_implicit_nullable():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'name', 'bar', 1, 1, None)])


def test_add_col_through_12step():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
         "CREATE TABLE new_foo(id PRIMARY KEY NOT NULL, name TEXT DEFAULT NULL, age INTEGER DEFAULT NULL);")
    # copy over old data
    c.execute("INSERT INTO new_foo (id, name) SELECT id, name FROM foo;")
    c.execute("INSERT INTO new_foo (id, name, age) VALUES (22, 'baz', 33);")
    # add a value for the new column in the old row
    c.execute("UPDATE new_foo SET age = 44 WHERE id = 3;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x03', 'name', None, 1, 1, None),
                        ('foo', b'\x01\t\x16', 'name', 'baz', 1, 1, None),
                        ('foo', b'\x01\t\x16', 'age', 33, 1, 1, None),
                        ('foo', b'\x01\t\x03', 'age', 44, 1, 1, None)])


def test_pk_only_table_backfill():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL);")
    c.execute("INSERT INTO foo VALUES (1);")
    c.execute("INSERT INTO foo VALUES (2);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\x09\x01', '-1', None, 1, 1, None),
                        ('foo', b'\x01\x09\x02', '-1', None, 1, 1, None)])


# Imagine the case where we have a table:
# CREATE TABLE foo (a primary key, b DEFAULT NULL)
# With inserts:
# INSERT INTO foo (a) VALUES (1);
#
# If we optimize backfill to ignore columns with default values
# we may never record the insert of the row with just the pk column.
def test_pk_and_default_backfill():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL, b);")
    c.execute("INSERT INTO foo (id) VALUES (1);")
    c.execute("INSERT INTO foo (id) VALUES (2);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    # Rows should be backfilled
    assert (changes == [('foo', b'\x01\t\x01', 'b', None, 1, 1, None),
                        ('foo', b'\x01\t\x02', 'b', None, 1, 1, None)])


def test_pk_and_default_backfill_post12step_with_new_rows():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY NOT NULL, b);")
    # copy over old data
    c.execute("INSERT INTO new_foo (id) VALUES (1);")
    c.execute("INSERT INTO new_foo (id) VALUES (2);")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    # Backfill should create the rows added during the alter
    # db version is 0 due to assumptions about migrations.
    # that rows created migrations should be assigned to the current
    # db version as migrations will generate the same data
    # on each db.
    # to do something other than this assumption then the user
    # can:
    # 1. do schema alterations in begin/commit alter
    # 2. do data alterations after commit alter
    # data alterations will then get new db versions.
    assert (changes == [('foo', b'\x01\t\x01', 'b', None, 0, 1, None),
                        ('foo', b'\x01\t\x02', 'b', None, 0, 1, None)])


def test_add_column_and_set_column():
    # if we do this and then do the `insert into new_foo` do we end
    # up missing these updates?
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY NOT NULL);")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()
    changes = c.execute(full_changes_query).fetchall()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "ALTER TABLE foo ADD COLUMN age INTEGER DEFAULT NULL;")
    c.execute("UPDATE foo SET age = 44 WHERE id = 3;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\x09\x03', '-1', None, 1, 1, None),
                        ('foo', b'\x01\x09\x03', 'age', 44, 1, 1, None)])


# TODO: users can not remove rows during a migration
# They need to remove the rows then start the migration.
def test_remove_rows_on_alter():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (3, 4);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "ALTER TABLE foo ADD COLUMN c INTEGER DEFAULT NULL;")
    c.execute("DELETE FROM foo WHERE a = 1;")
    c.execute("DELETE FROM foo WHERE a = 3;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    # If we are to allow users to remove rows during a migration,
    # this would need to track `-1` at the next db version
    # for every row that was removed.
    # We could discover this by checking the metadata table against
    # the table itself. If there are rows in the table which are not
    # in the metadata table, we need to backfill those rows with
    # -1 for the primary key.
    # Does it matter to create delete records on migration?
    # If the migration is the same on all nodes then no. i.e., it is
    # guaranteed to delete the same rows on all nodes.
    # For maximal safety we should record delete records, however.
    # Current workaround is for the user to delete records _then_
    # start `crsql_begin_alter` for that table.
    assert (changes == [])


# TODO: this doesn't work at the moment and will not work until
# we have a way to diff tables.
# The workaround here would be:
# 1. make the changes to the schema between begin and commit alter
# 2. after committing the alter, do changes of values
# So we should simply publish some rules on migrations:
# 1. Do _schema modifications_ in begin/commit alter
# 2. Do _data modifications_ after commit alter
def test_change_existing_values_on_alter():
    None


# Table structures are identical but we change primary key membership
def test_remove_col_from_pk():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a NOT NULL, b NOT NULL, c, PRIMARY KEY (a, b));")
    c.execute("SELECT crsql_as_crr('foo');")
    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a PRIMARY KEY NOT NULL, b, c);")
    c.execute("INSERT INTO new_foo SELECT * FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None),
                        ('foo', b'\x01\t\x01', 'c', 3, 1, 1, None),
                        ('foo', b'\x01\t\x04', 'b', 5, 1, 1, None),
                        ('foo', b'\x01\t\x04', 'c', 6, 1, 1, None)])

    None


# Like the above test but we completely remove the column
# rather than just remove it from pk particiaption
def test_remove_pk_column():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a NOT NULL, b NOT NULL, c, PRIMARY KEY (a, b));")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(b PRIMARY KEY NOT NULL, c);")
    c.execute("INSERT INTO new_foo SELECT b, c FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x01\t\x02', 'c', 3, 1, 1, None),
                        ('foo', b'\x01\t\x05', 'c', 6, 1, 1, None)])


def test_add_existing_col_to_pk():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b, c);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a NOT NULL, b NOT NULL, c, PRIMARY KEY (a, b));")
    c.execute("INSERT INTO new_foo SELECT * FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x02\t\x01\t\x02', 'c', 3, 1, 1, None),
                        ('foo', b'\x02\t\x04\t\x05', 'c', 6, 1, 1, None)])


def test_add_new_col_to_pk():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a NOT NULL, b, c NOT NULL, PRIMARY KEY (a, c));")
    c.execute("INSERT INTO new_foo SELECT a, b, b + 1 FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', b'\x02\t\x01\t\x03', 'b', 2, 1, 1, None),
                        ('foo', b'\x02\t\x04\t\x06', 'b', 5, 1, 1, None)])


# DB version isn't bumped but this is fine...
# given if someone already synced with us they'll have these
# rows which will be migrated correctly when they receive the migration.
# rethink: maybe none of the primary key changing migrations should change
# db versions? Or none of the migrations should move forward the
# db version at all???
# given the migration isn't causing _new rows_ for others...
def test_rename_pk_column():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("CREATE TABLE new_foo(c PRIMARY KEY NOT NULL, b)")
    c.execute("INSERT INTO new_foo SELECT a, b FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()

    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None),
                        ('foo', b'\x01\t\x04', 'b', 5, 1, 1, None)])


def test_pk_only_table_pk_membership():
    None


def test_changing_values_in_primary_key_columns():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("UPDATE foo SET a = 2 WHERE a = 1;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    # TODO: should we not be recording a delete fro `a = 1` given the row was last
    # as a result of the migration? Hmm.. under the current rules of "no sync while schema mismatch"
    # this shouldn't be required.
    assert (changes == [('foo', b'\x01\t\x02', 'b', 2, 1, 1, None),
                        ('foo', b'\x01\t\x04', 'b', 5, 1, 1, None)])


def test_12step_backfill_retains_siteid():
    None
