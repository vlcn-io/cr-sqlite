import pathlib
from uuid import UUID
from crsql_correctness import connect


def test_c1():
    c = connect(":memory:")
    siteid_bytes = c.execute("select crsql_site_id()").fetchone()[0]
    siteid = UUID(bytes=siteid_bytes)
    assert siteid.bytes == siteid_bytes


def test_c2():
    c = connect(":memory:")
    siteid_fn = c.execute("select crsql_site_id()").fetchone()[0]
    siteid_tbl = c.execute("select site_id from __crsql_site_id").fetchone()[0]

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
