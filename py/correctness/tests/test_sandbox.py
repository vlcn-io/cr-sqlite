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
        db.execute("create table foo (id INTEGER PRIMARY KEY)")
        db.execute("select crsql_as_crr('foo')")
        db.commit()

    setup(db1)
    setup(db2)

    db1.execute("INSERT INTO foo VALUES (1)")
    sync_left_to_right(db1, db2)
