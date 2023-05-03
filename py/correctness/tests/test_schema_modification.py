from crsql_correctness import connect
import pprint
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
    c.execute("create table \"foo\" (a primary key)")
    c.execute("select crsql_as_crr('foo')")
    c.execute("create table `bar` (a primary key)")
    c.execute("select crsql_as_crr('bar')")
    c.execute("create table [baz] (a primary key)")
    c.execute("select crsql_as_crr('baz')")

    def check_clock(t): return c.execute(
        "SELECT rowid, __crsql_col_version, __crsql_db_version, __crsql_col_name, __crsql_site_id FROM {t}__crsql_clock".format(t=t)).fetchall()

    check_clock("foo")
    check_clock("bar")
    check_clock("baz")


def test_c1_c5_compound_primary_key():
    c = connect(":memory:")
    # TODO: this was a silent failure when `create` as typoed
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
    assert (changes == [('todo', '1', 'name', "'cook'"),
                        ('todo', '1', 'complete', '0'),
                        ('todo', '1', 'list', "'home'"),
                        ('todo', '1', 'assignee', 'NULL'),
                        ('todo', '1', 'due_date', "'2018-01-01'")])

    # we should be able to add entries
    c.execute(
        "INSERT INTO todo (id, name, complete, list, assignee) VALUES (2, 'clean', 0, 'home', 'me');")
    c.commit()
    changes = c.execute(changes_query).fetchall()
    assert (changes == [('todo', '1', 'name', "'cook'"),
                        ('todo', '1', 'complete', '0'),
                        ('todo', '1', 'list', "'home'"),
                        ('todo', '1', 'assignee', 'NULL'),
                        ('todo', '1', 'due_date', "'2018-01-01'"),
                        ('todo', '2', 'name', "'clean'"),
                        ('todo', '2', 'complete', '0'),
                        ('todo', '2', 'list', "'home'"),
                        ('todo', '2', 'assignee', "'me'"),
                        ('todo', '2', 'due_date', "'2018-01-01'")])


def test_backfill_clocks_on_rename():
    # renaming a column should backfill the clock table with the new name
    # and drop entries for the old name
    c = setup_alter_test()
    c.execute("INSERT INTO todo VALUES (2, 'clean', 0, 'home');")
    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo RENAME name TO task;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()
    changes = c.execute(changes_with_versions_query).fetchall()

    assert (changes == [('todo', '1', 'complete', '0', 1, 1),
                        ('todo', '1', 'list', "'home'", 1, 1),
                        ('todo', '2', 'complete', '0', 2, 1),
                        ('todo', '2', 'list', "'home'", 2, 1),
                        # the original task got its db_version bumped because the column name changed.
                        # not sure we actually want to do this if it is a rename.. but we can't actually track a rename. A rename looks like a
                        # drop followed by an add to us.
                        # On completion of https://github.com/vlcn-io/cr-sqlite/issues/181 we could track renames.
                        ('todo', '1', 'task', "'cook'", 2, 1),
                        ('todo', '2', 'task', "'clean'", 2, 1)])
    None


def test_delete_sentinels_not_lost():
    # not lost after alter
    # nor lost on crr re-application
    # pk only / create
    # delete
    # records
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
    assert (changes == [('todo', '1', '__crsql_del', None),
            ('todo', '1', '__crsql_del', None)])


# get a sentinel for PK only table
# add a column, sentinel removed but column def created
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

    changes = c.execute(changes_query).fetchall()
    assert (changes == [('assoc', '1|2', 'data', 'NULL')])


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
def test_backfill_for_alter_moves_dbversion():
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
             # There are no entries for new nullable columns for old rows
             # New row gets new db version (2).
             ('foo', '2', 'name', "'baz'", 2, 1, None),
             ('foo', '2', 'age', '33', 2, 1, None)])


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
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None),
                        # TODO: where is the metadata from the default value column?
                        # the presence of a new column with a default value causes a new metadata row at the next db_version
                        ('foo', '1', 'age', '0', 2, 1, None)])
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
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None),
                        ('foo', '1', 'age', 'NULL', 2, 1, None)])


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
    assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None),
                        ('foo', '1', 'age', 'NULL', 2, 1, None)])


def test_add_col_through_12step():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id PRIMARY KEY, name TEXT DEFAULT NULL);")
    c.execute("INSERT INTO foo VALUES (1, 'bar');")
    c.execute("INSERT INTO foo VALUES (2, 'baz');")
    c.execute("INSERT INTO foo (id) VALUES (3);")
    c.execute("SELECT crsql_as_crr('foo');")
    c.commit()

    c.execute("SELECT crsql_begin_alter('foo');")
    c.execute(
        "CREATE TABLE new_foo(id PRIMARY KEY, name TEXT DEFAULT NULL, age INTEGER DEFAULT NULL);")
    # copy over old data
    c.execute("INSERT INTO new_foo (id, name) SELECT id, name FROM foo;")
    # TODO: this insert below changes how defaults are backfilled!!!
    # should we even backfill default values? seems useless.
    # c.execute("INSERT INTO new_foo (id, name, age) VALUES (22, 'baz', 33);")
    c.execute("DROP TABLE foo;")
    c.execute("ALTER TABLE new_foo RENAME TO foo;")
    c.execute("SELECT crsql_commit_alter('foo');")

    changes = c.execute(full_changes_query).fetchall()
    pprint.pprint(changes)
    pprint.pprint(c.execute("SELECT * FROM foo__crsql_clock").fetchall())

    # altering a table via create new, copy, drop old, rename new should be equivalent to an alter table
    # assert (changes == [('foo', '1', 'name', "'bar'", 1, 1, None),
    #                     ('foo', '1', 'age', 'NULL', 2, 1, None)])


# TODO: if we do optimize to not set columns with default values
# then we could miss an insert of just the pk column.

def test_pk_only_table_backfill():
    None


# Imagine the case where we have a table:
# CREATE TABLE foo (a primary key, b DEFAULT NULL)
# With inserts:
# INSERT INTO foo (a) VALUES (1);
#
# If we optimize backfill to ignore columns with default values
# we may never record the insert of the row with just the pk column.
def test_pk_and_default_backfill():
    None


# Someone adds a column (with no default) then sets the value
# for that column for all rows.
def test_add_column_and_set_column():
    # if we do this and then do the `inert into new_foo` do we end
    # up missing these updates?
    None


def test_backfill_for_table_with_defaults():
    # do default null columns get any metadata?
    # do default values columns get metadata?
    None


def test_remove_rows_on_alter():
    None


def test_change_existing_values_on_alter():
    None


def test_remove_pk_column():
    None


def test_add_pk_column():
    None


def test_rename_pk_column():
    None


def test_changing_primary_key_columns():

    # sqlite doesn't allow altering primary key def in an existing schema. Not even renames.
    # def test_clock_nuke_on_pk_schema_alter():
    #     c = setup_alter_test()
    #     c.execute("SELECT crsql_begin_alter('todo');")
    #     c.execute("ALTER TABLE todo RENAME id TO todo_id;")
    #     c.execute("SELECT crsql_commit_alter('todo');")
    #     c.commit()
    #     changes = c.execute(changes_query).fetchall()

    None


def test_12step_backfill_retains_siteid():
    None

    # TODO: test that we are not compacting out sentinel clock rows
    # post alter.

    # Do we ever actually backfill? New columns with new data brought over from 12 step, yes we'd need to backfill
    # in those cases.
