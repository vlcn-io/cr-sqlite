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
        db.execute("CREATE TABLE hoot (a, b primary key, c)")
        db.execute("SELECT crsql_as_crr('hoot')")
        db.commit()

        db.execute("INSERT INTO hoot VALUES (1, 1, 1)")
        db.commit()
        db.execute("UPDATE hoot SET a = 1 WHERE b = 1")
        db.commit()
        db.execute("UPDATE hoot SET a = 2 WHERE b = 1")
        db.commit()
        db.execute("UPDATE hoot SET a = 3 WHERE b = 1")
        db.commit()

    setup(db1)
    setup(db2)

    db1_v = db1.execute("SELECT crsql_dbversion()").fetchone()
    db2_v = db2.execute("SELECT crsql_dbversion()").fetchone()

    pprint(db1_v)
    pprint(db2_v)

    sync_left_to_right(db1, db2)

    db1_v = db1.execute("SELECT crsql_dbversion()").fetchone()
    db2_v = db2.execute("SELECT crsql_dbversion()").fetchone()
    pprint(db1_v)
    pprint(db2_v)

    pprint(db2.execute("SELECT * FROM crsql_changes").fetchall())
