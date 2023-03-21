from crsql_correctness import connect
import pprint
import pytest

changes_query = "SELECT [table], [pk], [cid], [val] FROM crsql_changes"
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


# sqlite doesn't allow altering primary key def in an existing schema. Not even renames.
# def test_clock_nuke_on_pk_schema_alter():
#     c = setup_alter_test()
#     c.execute("SELECT crsql_begin_alter('todo');")
#     c.execute("ALTER TABLE todo RENAME id TO todo_id;")
#     c.execute("SELECT crsql_commit_alter('todo');")
#     c.commit()
#     changes = c.execute(changes_query).fetchall()

#     pprint.pprint(changes)
#     None


def test_backfill_clocks_on_rename():
    # renaming a column should backfill the clock table
    c = setup_alter_test()
    c.execute("INSERT INTO todo VALUES (2, 'clean', 0, 'home');")
    c.execute("SELECT crsql_begin_alter('todo');")
    c.execute("ALTER TABLE todo RENAME name TO task;")
    c.execute("SELECT crsql_commit_alter('todo');")
    c.commit()
    changes = c.execute(changes_query).fetchall()

    # todo: clocks aren't getting backfilled for the renamed col :/
    # the rename isn't working since there _are_ clock entries for the old row.
    # but just not for a specific column in that row.

    pprint.pprint(changes)
    None

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
