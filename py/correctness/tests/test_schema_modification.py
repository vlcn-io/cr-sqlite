from crsql_correctness import connect
from crsql_correctness import close
import pprint
import pytest

changes_query = "SELECT [table], [pk], [cid], [val] FROM crsql_changes"
changes_with_versions_query = "SELECT [table], [pk], [cid], [val], [db_version], [col_version] FROM crsql_changes"
full_changes_query = "SELECT [table], [pk], [cid], [val], [db_version], [col_version], [site_id] FROM crsql_changes"
clock_query = "SELECT __crsql_opid, __crsql_col_version, __crsql_db_version, __crsql_col_name, __crsql_site_id FROM todo__crsql_clock ORDER BY __crsql_opid ASC"


def test_c1_4_no_primary_keys():
    c = connect(":memory:")
    c.execute("create table foo (a)")
    with pytest.raises(Exception) as e_info:
        c.execute("select crsql_as_crr('foo')")


def test_c1_3_quoted_identifiers():
    c = connect(":memory:")
    c.execute("create table \"foo\" (a primary key)")
    c.execute("select crsql_as_crr('foo')")
    c.execute("create table `bar` (a primary key)")
    c.execute("select crsql_as_crr('bar')")
    c.execute("create table [baz] (a primary key)")
    c.execute("select crsql_as_crr('baz')")

    def check_clock(t): return c.execute(
        "SELECT __crsql_opid, __crsql_col_version, __crsql_db_version, __crsql_col_name, __crsql_site_id FROM {t}__crsql_clock".format(t=t)).fetchall()

    check_clock("foo")
    check_clock("bar")
    check_clock("baz")


def test_c1_c5_compound_primary_key():
    c = connect(":memory:")
    c.execute("create table foo (a, b, c, primary key (a, b))")
    c.execute("select crsql_as_crr('foo')")

    c.execute("SELECT a, b, __crsql_col_version, __crsql_col_name, __crsql_db_version, __crsql_site_id FROM foo__crsql_clock").fetchall()
    # with pytest.raises(Exception) as e_info:
    # c.execute("SELECT a__crsql_v FROM foo__crsql_crr").fetchall()


def test_c1_6_single_primary_key():
    c = connect(":memory:")
    c.execute("create table foo (a, b, c, primary key (a))")
    c.execute("select crsql_as_crr('foo')")
    c.execute("SELECT a, __crsql_col_version, __crsql_col_name, __crsql_db_version, __crsql_site_id FROM foo__crsql_clock").fetchall()


def test_c2_create_index():
    c = connect(":memory:")
    c.execute("create table foo (a primary key, b, c)")

    # TODO: create index is silent failing in some cases?
    c.execute("create index foo_idx on foo (b)")
    c.execute("select crsql_as_crr('foo')")
    idx_info = c.execute(
        "select * from pragma_index_info('foo_idx')").fetchall()

    # print(idx_info)


def setup_alter_test():
    c = connect(":memory:")
    c.execute("CREATE TABLE todo (id PRIMARY KEY, name, complete, list);")
    c.execute("SELECT crsql_as_crr('todo');")
    c.execute("INSERT INTO todo VALUES (1, 'cook', 0, 'home');")
    c.commit()
    return c


def test_drop_clock_on_col_remove():
    c = setup_alter_test()
    changes = c.execute(changes_query).fetchall()
    expected = [
        ('todo', '1', 'name', "'cook'"),
        ('todo', '1', 'complete', '0'),
        ('todo', '1', 'list', "'home'"),
    ]
    assert (changes == expected)

    clock_entries = c.execute(clock_query).fetchall()
    assert (clock_entries == [
        (1, 1, 1, 'name', None),
        (2, 1, 1, 'complete', None),
        (3, 1, 1, 'list', None),
    ])

    c.execute("SELECT crsql_begin_alter('todo');")
    # Dropping a column should remove its entries from our replication logs.
    c.execute("ALTER TABLE todo DROP COLUMN list;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    expected = [
        ('todo', '1', 'name', "'cook'"),
        ('todo', '1', 'complete', '0'),
    ]
    assert (changes == expected)

    clock_entries = c.execute(clock_query).fetchall()
    assert (
        clock_entries == [(1, 1, 1, 'name', None), (2, 1, 1, 'complete', None)]
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
    assert (changes == [('todo', '1', 'name', "'cook'"),
                        ('todo', '1', 'complete', '0'),
                        ('todo', '1', 'list', "'home'")])

    # we should be able to add entries
    c.execute(
        "INSERT INTO todo (id, name, complete, list, assignee) VALUES (2, 'clean', 0, 'home', 'me');")
    c.commit()
    changes = c.execute(changes_query).fetchall()
    assert (changes == [('todo', '1', 'name', "'cook'"),
                        ('todo', '1', 'complete', '0'),
                        ('todo', '1', 'list', "'home'"),
                        ('todo', '2', 'name', "'clean'"),
                        ('todo', '2', 'complete', '0'),
                        ('todo', '2', 'list', "'home'"),
                        ('todo', '2', 'assignee', "'me'"),
                        ('todo', '2', 'due_date', "'2018-01-01'")])


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

    assert (changes == [('todo', '1', 'complete', '0', 1, 1),
                        ('todo', '1', 'list', "'home'", 1, 1),
                        ('todo', '2', 'complete', '0', 2, 1),
                        ('todo', '2', 'list', "'home'", 2, 1),
                        ('todo', '1', 'task', "'cook'", 2, 1),
                        ('todo', '2', 'task', "'clean'", 2, 1)])


def test_delete_sentinels_not_lost():
    c = setup_alter_test()
    c.execute("DELETE FROM todo WHERE id = 1;")
    c.commit()
    changes = c.execute(changes_query).fetchall()

    # starting off correctly
    assert (changes == [('todo', '1', '__crsql_del', None),
                        ('todo', '1', '__crsql_del', None),
                        ('todo', '1', '__crsql_del', None),
                        ('todo', '1', '__crsql_del', None)])

    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo RENAME name TO task;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    assert (changes == [('todo', '1', '__crsql_del', None)])


def test_pk_only_sentinels():
    c = connect(":memory:")
    c.execute("CREATE TABLE assoc (id1, id2, PRIMARY KEY (id1, id2));")
    c.execute("SELECT crsql_as_crr('assoc');")
    c.execute("INSERT INTO assoc VALUES (1, 2);")
    c.commit()

    changes = c.execute(changes_query).fetchall()
    assert (changes == [('assoc', '1|2', '__crsql_pko', None)])

    c.execute("SELECT crsql_begin_alter('assoc');")
    c.execute("ALTER TABLE assoc ADD COLUMN data;")
    c.execute("SELECT crsql_commit_alter('assoc');")
    c.commit()

    # Sentinels are still retained after the alter
    changes = c.execute(changes_query).fetchall()
    assert (changes == [('assoc', '1|2', '__crsql_pko', None)])


# Get a sentinel for PK only table
# Remove pk column? Impossible in SQLite, right?

# TODO: property based test to flip through different number of cols, col types,
# differing amounts of rows, differing number of pk columns, etc.


def test_backfill_existing_data():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("INSERT INTO foo VALUES (2, 'baz');")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.commit()

    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(changes_query).fetchall()

    assert (changes == [('foo', '1', 'name', "'bar'"),
                        ('foo', '2', 'name', "'baz'"),
                        ('foo', '3', 'name', 'NULL')])


# This creates table which have existing data.
# Converting a table that already has data to a `crr` should:
# 1. backfill metadata for existing row
# 2. that backfilled metadata should get the _next_ db version assigned to it
def test_backfill_moves_dbversion():
    c = connect(":memory:")
    # First table which'll get db_version 1 for all rows backfilled
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("INSERT INTO foo VALUES (2, 'baz');")
    c.commit()

    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    # Next table which should get db_Version 2 for all rows backfilled
    c.execute("CREATE TABLE bar (id PRIMARY KEY, name);")
    c.execute("INSERT INTO bar VALUES (1, 'bar');")
    c.execute("INSERT INTO bar (id) VALUES (3);")

    c.execute("SELECT crsql_as_crr('bar');")
    c.commit()

    changes = c.execute(changes_with_versions_query).fetchall()
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1),  # first 2 are db_version 1
                        ('foo', '2', 'name', "'baz'", 1, 1),
                        # next 2 are db_version 2
                        ('bar', '1', 'name', "'bar'", 2, 1),
                        ('bar', '3', 'name', 'NULL', 2, 1)])


# Similar to the above test but checks that `crsql_alter` does the right thing.
# See comments on create_clock_rows_from_stmt on why we don't bump db version
# on alter commit.
def test_backfill_for_alter_does_not_move_dbversion():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    # - change name to have a default value
    # - add an age column (nullable)
    # - add a row with a name and age
    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY, name TEXT DEFAULT 'none', age INTEGER DEFAULT NULL);")
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
    assert (changes ==
            # Existing rows have their existing db_version (1).
            [('foo', '1', 'name', "'bar'", 1, 1, None),
             # New rows get the current db version given
             # migrations on other will create convergence.
             ('foo', '2', 'name', "'baz'", 1, 1, None),
             ('foo', '2', 'age', '33', 1, 1, None)])


def test_add_col_with_default():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER DEFAULT 0;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    # No change given we only added a column with a default value and we need
    # not backfill default values
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None)])
    None


def test_add_col_nullable():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER DEFAULT NULL;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None)])


def test_add_col_implicit_nullable():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo ADD COLUMN age INTEGER;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None)])


def test_add_col_through_12step():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY, name TEXT DEFAULT NULL, age INTEGER DEFAULT NULL);")
    # copy over old data
    c.execute("INSERT INTO new_foo (id, name) SELECT id, name FROM foo;")
    c.execute("INSERT INTO new_foo (id, name, age) VALUES (22, 'baz', 33);")
    # add a value for the new column in the old row
    c.execute("UPDATE new_foo SET age = 44 WHERE id = 3;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '3', 'name', 'NULL', 1, 1, None),
                        # New row (22) appropriately gets same db version
                        # see create_clock_rows_from_stmt
                        ('foo', '22', 'name', "'baz'", 1, 1, None),
                        ('foo', '22', 'age', '33', 1, 1, None),
                        # age was updated to a new value during migration so db_version appropriately incremented
                        ('foo', '3', 'age', '44', 1, 1, None)])


def test_pk_only_table_backfill():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY);")
    c.execute("INSERT INTO foo VALUES (1);")
    c.execute("INSERT INTO foo VALUES (2);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '1', '__crsql_pko', None, 1, 1, None),
                        ('foo', '2', '__crsql_pko', None, 1, 1, None)])


# Imagine the case where we have a table:
# CREATE TABLE foo (a primary key, b DEFAULT NULL)
# With inserts:
# INSERT INTO foo (a) VALUES (1);
#
# If we optimize backfill to ignore columns with default values
# we may never record the insert of the row with just the pk column.
def test_pk_and_default_backfill():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, b);")
    c.execute("INSERT INTO foo (id) VALUES (1);")
    c.execute("INSERT INTO foo (id) VALUES (2);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    # Rows should be backfilled
    assert (changes == [('foo', '1', 'b', 'NULL', 1, 1,
            None), ('foo', '2', 'b', 'NULL', 1, 1, None)])


def test_pk_and_default_backfill_post12step_with_new_rows():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY, b);")
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
    assert (changes == [('foo', '1', 'b', 'NULL', 0, 1,
            None), ('foo', '2', 'b', 'NULL', 0, 1, None)])


def test_add_column_and_set_column():
    # if we do this and then do the `insert into new_foo` do we end
    # up missing these updates?
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY);")
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
    assert (changes == [('foo', '3', '__crsql_pko', None, 1, 1, None),
                        ('foo', '3', 'age', '44', 1, 1, None)])


# TODO: users can not remove rows during a migration
# They need to remove the rows then start the migration.
def test_remove_rows_on_alter():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
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
    # this would need to track `__crsql_del` at the next db version
    # for every row that was removed.
    # We could discover this by checking the metadata table against
    # the table itself. If there are rows in the table which are not
    # in the metadata table, we need to backfill those rows with
    # __crsql_del for the primary key.
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
    c.execute("CREATE TABLE foo (a, b, c, PRIMARY KEY (a, b));")
    c.execute("SELECT crsql_as_crr('foo');")
    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a PRIMARY KEY, b, c);")
    c.execute("INSERT INTO new_foo SELECT * FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '1', 'b', '2', 1, 1, None),
                        ('foo', '1', 'c', '3', 1, 1, None),
                        ('foo', '4', 'b', '5', 1, 1, None),
                        ('foo', '4', 'c', '6', 1, 1, None)])

    None


# Like the above test but we completely remove the column
# rather than just remove it from pk particiaption
def test_remove_pk_column():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a, b, c, PRIMARY KEY (a, b));")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(b PRIMARY KEY, c);")
    c.execute("INSERT INTO new_foo SELECT b, c FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '2', 'c', '3', 1, 1, None),
            ('foo', '5', 'c', '6', 1, 1, None)])


def test_add_existing_col_to_pk():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b, c);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3);")
    c.execute("INSERT INTO foo VALUES (4, 5, 6);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a, b, c, PRIMARY KEY (a, b));")
    c.execute("INSERT INTO new_foo SELECT * FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    assert (changes == [('foo', '1|2', 'c', '3', 1, 1, None),
            ('foo', '4|5', 'c', '6', 1, 1, None)])


def test_add_new_col_to_pk():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(a, b, c, PRIMARY KEY (a, c));")
    c.execute("INSERT INTO new_foo SELECT a, b, b + 1 FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()

    assert (changes == [('foo', '1|3', 'b', '2', 1, 1, None),
            ('foo', '4|6', 'b', '5', 1, 1, None)])


# DB version isn't bumped but this is fine...
# given if someone already synced with us they'll have these
# rows which will be migrated correctly when they receive the migration.
# rethink: maybe none of the primary key changing migrations should change
# db versions? Or none of the migrations should move forward the
# db version at all???
# given the migration isn't causing _new rows_ for others...
def test_rename_pk_column():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("CREATE TABLE new_foo(c PRIMARY KEY, b)")
    c.execute("INSERT INTO new_foo SELECT a, b FROM foo;")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")
    c.commit()

    changes = c.execute(full_changes_query).fetchall()

    assert (changes == [('foo', '1', 'b', '2', 1, 1, None),
            ('foo', '4', 'b', '5', 1, 1, None)])


def test_pk_only_table_pk_membership():
    None


# Should save off opid and dbversion for later insertions.
def test_remove_rows_with_latest_versions():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2);")
    c.execute("INSERT INTO foo VALUES (4, 5);")
    c.commit()

    pre_changes = c.execute("SELECT *, rowid FROM crsql_changes").fetchall()
    assert (pre_changes == [('foo', '1', 'b', '2', 1, 1,
            None, 1), ('foo', '4', 'b', '5', 1, 1, None, 2)])

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute("ALTER TABLE foo DROP COLUMN b;")
    c.execute("SELECT crsql_commit_alter('foo');")

    post_changes = c.execute("SELECT *, rowid FROM crsql_changes").fetchall()
    # TODO: What should this really look like?
    # - dbversion is the db's current version since we're assuming migrations
    # put everyone into identical states. I.e., we don't need to sync the result of a _structural_ migration.
    # - opid is the next opid... we don't know what to set it to if we'd want to keep it stable.
    # so if someone syncs on opid they'd sync structural results of a migration... :|
    assert (post_changes == [('foo', '1', '__crsql_pko', None, 1, 1, None, 3),
                             ('foo', '4', '__crsql_pko', None, 1, 1, None, 4)])
    close(c)


def test_compact_due_to_remove():
    c = connect(":memory:")
    c.execute("CREATE TABLE bar (a PRIMARY KEY, b);")
    c.execute("SELECT crsql_as_crr('bar');")
    c.commit()

    c.execute("INSERT INTO bar VALUES (1, 2);")
    c.execute("INSERT INTO bar VALUES (4, 5);")
    c.commit()

    pre_changes = c.execute("SELECT *, rowid FROM crsql_changes").fetchall()

    c.execute("SELECT crsql_begin_alter('bar');")
    c.execute("CREATE TABLE new_bar(a PRIMARY KEY, c DEFAULT NULL);")
    c.execute("INSERT INTO new_bar (a) SELECT a FROM bar;")
    c.execute("DROP TABLE bar;")
    c.execute("ALTER TABLE new_bar RENAME TO bar;")
    c.execute("SELECT crsql_commit_alter('bar');")

    post_changes = c.execute("SELECT *, rowid FROM crsql_changes").fetchall()
    # opids move forward -- we did not lose the fact that the most recent opid was _2_,
    # making the next opid 3, even though we dropped the rows recording that opid.
    assert (post_changes == [('bar', '1', 'c', 'NULL', 1, 1, None, 3),
                             ('bar', '4', 'c', 'NULL', 1, 1, None, 4)])

    close(c)


def test_changing_values_in_primary_key_columns():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
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
    assert (changes == [('foo', '4', 'b', '5', 1, 1, None),
            ('foo', '2', 'b', '2', 1, 1, None)])


def test_12step_backfill_retains_siteid():
    None
