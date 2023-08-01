from crsql_correctness import connect, close, min_db_v
from pprint import pprint

# exploratory tests to debug changes


def sync_left_to_right(l, r):
    changes = l.execute(
        "SELECT * FROM crsql_changes")
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def test_sync():
    db1 = connect(":memory:")
    db2 = connect(":memory:")

    def setup(db):
        db.execute("create table foo (a primary key, b)")
        db.execute("select crsql_as_crr('foo')")
        db.commit()

    setup(db1)
    setup(db2)

    db1.execute("insert into foo values (1, 2.0e2)")
    db1.commit()
    db2.execute("insert into foo values (2, X'1232')")
    db2.commit()

    sync_left_to_right(db1, db2)

    foo1 = db1.execute("SELECT * FROM foo ORDER BY a ASC").fetchall()
    foo2 = db2.execute("SELECT * FROM foo ORDER BY a ASC").fetchall()

    pprint(foo1)
    pprint(foo2)
