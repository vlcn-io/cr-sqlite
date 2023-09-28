from crsql_correctness import connect, min_db_v
from pprint import pprint


def test_c1_c2_c3_c4_c6_c7_crr_values():
    c = connect(":memory:")
    init_version = c.execute("SELECT crsql_db_version()").fetchone()[0]
    c.execute("create table foo (id primary key not null, a)")
    c.execute("select crsql_as_crr('foo')")

    c.execute("insert into foo values(1, 2)")
    c.commit()

    rows = c.execute(
        "select key, col_name, col_version, db_version, site_id from foo__crsql_clock").fetchall()
    assert [(1, 'a', 1, init_version + 1, None)] == rows
    new_version = c.execute("SELECT crsql_db_version()").fetchone()[0]

    assert new_version == init_version + 1

    clock_rows = c.execute("select * from foo__crsql_clock").fetchall()
    assert len(clock_rows) == 1

    row = c.execute("select id, a from foo").fetchone()
    assert row[0] == 1
    assert row[1] == 2

    new_version = c.execute("SELECT crsql_db_version()").fetchone()[0]

    assert new_version == init_version + 1
