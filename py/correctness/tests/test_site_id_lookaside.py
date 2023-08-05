from crsql_correctness import connect, close, min_db_v
from pprint import pprint
import random
# Test that we can insert with site id and then get it back out properly on read
# from crsql_changes


def make_simple_schema():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()
    return c


def test_insert_site_id():
    # is in lookaside
    # is an ordinal in actual table
    a = make_simple_schema()
    a.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 1, 1, x'1dc8d6bb7f8941088327d9439a7927a4', 1)")
    a.commit()

    # Ordinal value, not site id, is in the clock table
    ord = a.execute(
        "SELECT __crsql_site_id FROM foo__crsql_clock").fetchone()[0]
    assert (ord == 1)
    # site id is in the site id table for that given ordinal
    assert (
        a.execute(
            "SELECT quote(site_id) FROM crsql_site_id WHERE ordinal = ?", (ord,)
        ).fetchone()[0] == "x'1dc8d6bb7f8941088327d9439a7927a4'".upper())

    # site id comes out of crsql_changes as expected
    assert (a.execute("SELECT quote(site_id) FROM crsql_changes").fetchone()[
            0] == "x'1dc8d6bb7f8941088327d9439a7927a4'".upper())


def test_site_id_filter():
    a = make_simple_schema()
    a.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 1, 1, x'1dc8d6bb7f8941088327d9439a7927a4', 1)")
    a.commit()

    assert (a.execute(
        "SELECT quote(site_id) FROM crsql_changes WHERE site_id = x'1dc8d6bb7f8941088327d9439a7927a4'").fetchone()[0] == "x'1dc8d6bb7f8941088327d9439a7927a4'".upper())


def test_local_changes_have_null_site():
    a = make_simple_schema()
    a.execute("INSERT INTO foo VALUES (2,2)")
    a.execute("INSERT INTO foo VALUES (3,2)")
    a.execute("INSERT INTO foo VALUES (4,2)")
    a.commit()
    a.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 1, 1, x'1dc8d6bb7f8941088327d9439a7927a4', 1)")
    a.commit()

    assert (a.execute(
        "SELECT count(*) FROM crsql_changes WHERE site_id IS NULL").fetchone()[0] == 3)
    assert (a.execute(
        "SELECT count(*) FROM crsql_changes").fetchone()[0] == 4)
    None
