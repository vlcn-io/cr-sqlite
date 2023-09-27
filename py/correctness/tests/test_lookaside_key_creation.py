# Test key creation:

# - Stable rowid in all circumstances (re-insert, update, insert, delete, insert or ignore/replace/onconflict)
# - Always exists after each op
# - Created for mergers of new rows
# - Not created for merges of existing rows
# - Not created or deleted for merges of existing rows that are deleteed
# - Created for mergers of deletions for unseen rows

from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def sync_left_to_right(l, r, since):
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def simple_schema():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b TEXT)")
    c.execute("SELECT crsql_as_crr('foo')")
    c.execute("CREATE TABLE bar (a NOT NULL, b NOT NULL, PRIMARY KEY(a, b))")
    c.execute("SELECT crsql_as_crr('bar')")
    c.commit()
    return c


def test_insert():
    c = simple_schema()
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO bar VALUES (1, 2)")
    c.commit()

    rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = c.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_insert_or_replace():
    c = simple_schema()

    def run():
        c.execute("INSERT OR REPLACE INTO foo VALUES (1, 2)")
        c.execute("INSERT OR REPLACE INTO bar VALUES (1, 2)")
        c.commit()

        rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
        assert (rows == [(1, 1)])
        rows = c.execute("SELECT * FROM bar__crsql_pks").fetchall()
        assert (rows == [(1, 1, 2)])

    # should be identical no matter how many times we replace the same value
    # as in, the same set of primary keys should map to the same key. Always.
    run()
    run()
    run()


def test_insert_or_ignore():
    c = simple_schema()

    def run():
        c.execute("INSERT OR IGNORE INTO foo VALUES (1, 2)")
        c.execute("INSERT OR IGNORE INTO bar VALUES (1, 2)")
        c.commit()
        rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
        assert (rows == [(1, 1)])
        rows = c.execute("SELECT * FROM bar__crsql_pks").fetchall()
        assert (rows == [(1, 1, 2)])

    run()
    run()
    run()


def test_insert_on_conflict_update():
    c = simple_schema()

    def run():
        c.execute("INSERT INTO foo VALUES (1, 2) ON CONFLICT DO UPDATE SET b = 3")
        c.commit()

        rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
        assert (rows == [(1, 1)])

    run()
    run()
    run()


def test_update():
    c = simple_schema()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO bar VALUES (1, 2)")
    c.commit()

    c.execute("UPDATE foo SET b = 3 WHERE a = 1")
    c.execute("UPDATE foo SET b = 4 WHERE a = 1")
    c.execute("UPDATE foo SET b = 5 WHERE a = 1")
    c.commit()

    rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])

    c.execute("UPDATE foo SET a = 2 WHERE a = 1").fetchall()
    # we do not drop the old row since we'll start tracking sentinel metadata
    # on it
    rows = c.execute(
        "SELECT * FROM foo__crsql_pks ORDER BY __crsql_key").fetchall()
    assert (rows == [(1, 1), (2, 2)])

    c.execute("UPDATE bar SET b = 3 WHERE a = 1")
    c.execute("UPDATE bar SET b = 4 WHERE a = 1")
    c.execute("UPDATE bar SET b = 5 WHERE a = 1")
    c.commit()
    rows = c.execute(
        "SELECT * FROM bar__crsql_pks ORDER BY __crsql_key").fetchall()
    assert (rows == [(1, 1, 2), (2, 1, 3), (3, 1, 4), (4, 1, 5)])


def test_delete():
    c = simple_schema()
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO bar VALUES (1, 2)")
    c.commit()

    c.execute("DELETE FROM foo WHERE a = 1")
    c.execute("DELETE FROM bar WHERE a = 1 AND b = 2")
    c.commit()

    rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = c.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_delete_all():
    c = simple_schema()
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO bar VALUES (1, 2)")
    c.commit()

    c.execute("DELETE FROM foo")
    c.execute("DELETE FROM bar")
    c.commit()

    rows = c.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = c.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_merge_new_row():
    a = simple_schema()
    b = simple_schema()

    a.execute("INSERT INTO foo VALUES (1, 2)")
    a.execute("INSERT INTO bar VALUES (1, 2)")
    a.commit()

    sync_left_to_right(a, b, 0)
    rows = b.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = b.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_merge_existing_row():
    a = simple_schema()
    b = simple_schema()

    a.execute("INSERT INTO foo VALUES (1, 2)")
    a.execute("INSERT INTO bar VALUES (1, 2)")
    a.commit()
    b.execute("INSERT INTO foo VALUES (1, 2)")
    b.execute("INSERT INTO bar VALUES (1, 2)")
    b.commit()

    sync_left_to_right(a, b, 0)
    rows = b.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = b.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_merge_delete_new_row():
    a = simple_schema()
    b = simple_schema()

    a.execute("INSERT INTO foo VALUES (1, 2)")
    a.execute("INSERT INTO bar VALUES (1, 2)")
    a.commit()
    a.execute("DELETE FROM foo")
    a.execute("DELETE FROM bar")
    a.commit()

    sync_left_to_right(a, b, 0)
    rows = b.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = b.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_merge_delete_existing_row():
    a = simple_schema()
    b = simple_schema()

    a.execute("INSERT INTO foo VALUES (1, 2)")
    a.execute("INSERT INTO bar VALUES (1, 2)")
    a.commit()
    a.execute("DELETE FROM foo")
    a.execute("DELETE FROM bar")
    a.commit()
    b.execute("INSERT INTO foo VALUES (1, 2)")
    b.execute("INSERT INTO bar VALUES (1, 2)")
    b.commit()

    sync_left_to_right(a, b, 0)
    rows = b.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = b.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2)])


def test_merge_update_existing_row():
    a = simple_schema()
    b = simple_schema()

    a.execute("INSERT INTO foo VALUES (1, 2)")
    a.execute("INSERT INTO bar VALUES (1, 2)")
    a.commit()
    a.execute("UPDATE foo SET b = 3 WHERE a = 1")
    a.execute("UPDATE bar SET b = 3 WHERE a = 1")
    a.commit()
    b.execute("INSERT INTO foo VALUES (1, 2)")
    b.execute("INSERT INTO bar VALUES (1, 2)")
    b.commit()

    sync_left_to_right(a, b, 0)
    rows = b.execute("SELECT * FROM foo__crsql_pks").fetchall()
    assert (rows == [(1, 1)])
    rows = b.execute("SELECT * FROM bar__crsql_pks").fetchall()
    assert (rows == [(1, 1, 2), (2, 1, 3)])
