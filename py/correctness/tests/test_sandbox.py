from crsql_correctness import connect, close, min_db_v
from pprint import pprint

# exploratory tests to debug changes


def sync_left_to_right(l, r):
    changes = l.execute(
        "SELECT * FROM crsql_changes")
    for change in changes:
        r.execute("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def test_sync():
    db1 = connect(":memory:")
    db2 = connect(":memory:")

    db1.execute("CREATE TABLE foo (a primary key, b)")
    db1.execute("SELECT crsql_as_crr('foo')")
    db1.commit()

    db2.execute("CREATE TABLE foo (a primary key, b)")
    db2.execute("SELECT crsql_as_crr('foo')")
    db2.commit()

    db1.execute("INSERT INTO foo VALUES (1, 2.0e2)")
    db1.commit()
    db2.execute("INSERT INTO foo VALUES (2, X'1232')")
    db2.commit()

    sync_left_to_right(db1, db2)

    # pprint(db1.execute("SELECT * FROM foo").fetchall())
    # pprint(db1.execute("SELECT * FROM foo__crsql_clock").fetchall())
    # pprint(db1.execute("SELECT * FROM crsql_changes").fetchall())
    pprint(db2.execute("SELECT * FROM foo").fetchall())
    pprint(db2.execute("SELECT * FROM foo__crsql_clock").fetchall())
    pprint(db2.execute("SELECT * FROM crsql_changes").fetchall())
