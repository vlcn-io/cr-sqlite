import pathlib
from uuid import UUID
from crsql_correctness import connect
from pprint import pprint


def sync_left_to_right(l, r, since):
    r_site_id = r.execute("SELECT crsql_site_id()").fetchone()[0]
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?", (since, r_site_id))
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def test_c1():
    c = connect(":memory:")
    siteid_bytes = c.execute("select crsql_site_id()").fetchone()[0]
    siteid = UUID(bytes=siteid_bytes)
    assert siteid.bytes == siteid_bytes


def test_c2():
    c = connect(":memory:")
    siteid_fn = c.execute("select crsql_site_id()").fetchone()[0]
    siteid_tbl = c.execute("select site_id from crsql_site_id").fetchone()[0]

    assert siteid_fn == siteid_tbl


def test_c3c4():
    dbfile = "./siteid_c3c4.db"
    pathlib.Path(dbfile).unlink(missing_ok=True)
    c = connect(dbfile)

    siteid_initial = c.execute("select crsql_site_id()").fetchone()[0]
    c.close()

    c = connect(dbfile)
    siteid_restored = c.execute("select crsql_site_id()").fetchone()[0]

    assert siteid_initial == siteid_restored


# Site id is set to crsql_site_id on local writes
def test_site_id_for_local_writes():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (id not null, x, y, primary key (id))")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3)")
    c.commit()

    def check_counts():
        total_changes_count = c.execute(
            "SELECT count(*) FROM crsql_changes").fetchone()[0]
        changes_with_local_site_count = c.execute(
            "SELECT count(*) FROM crsql_changes WHERE site_id = crsql_site_id()").fetchone()[0]
        assert total_changes_count == changes_with_local_site_count

    c.execute("UPDATE foo SET x = 3 WHERE id = 1")
    c.commit()
    check_counts()

    c.execute("INSERT OR REPLACE INTO foo VALUES (1, 5, 9)")
    c.commit()
    check_counts()

    c.execute("DELETE FROM foo")
    c.commit()
    check_counts()


def test_site_id_from_merge():
    def simple_schema():
        a = connect(":memory:")
        a.execute("create table foo (a primary key not null, b);")
        a.commit()
        a.execute("SELECT crsql_as_crr('foo')")
        a.commit()
        return a

    a = simple_schema()
    a.execute("INSERT INTO foo VALUES (1, 2.0e2);")
    a.commit()
    a.execute("INSERT INTO foo VALUES (2, X'1232');")
    a.commit()

    b = simple_schema()
    c = simple_schema()

    sync_left_to_right(a, b, 0)
    sync_left_to_right(b, c, 0)

    site_ids_fromC = c.execute(
        "SELECT site_id FROM crsql_changes ORDER BY pk ASC").fetchall()
    site_ids_fromB = b.execute(
        "SELECT site_id FROM crsql_changes ORDER BY pk ASC").fetchall()
    site_ids_fromA = a.execute(
        "SELECT site_id FROM crsql_changes ORDER BY pk ASC").fetchall()
    assert site_ids_fromC == site_ids_fromA
    assert site_ids_fromB == site_ids_fromA
