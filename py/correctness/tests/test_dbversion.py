import pathlib
from crsql_correctness import connect, close, min_db_v

# c1


def test_min_on_init():
    c = connect(":memory:")
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v

# c2


def test_increments_on_modification():
    c = connect(":memory:")
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.execute("insert into foo values (1, 2)")
    c.execute("commit")
    # +2 since create table statements bump version too
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 1
    c.execute("update foo set a = 3 where id = 1")
    c.execute("commit")
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 2
    c.execute("delete from foo where id = 1")
    c.execute("commit")
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 3
    close(c)

# c3


def test_db_version_restored_from_disk():
    dbfile = "./dbversion_c3.db"
    pathlib.Path(dbfile).unlink(missing_ok=True)
    c = connect(dbfile)

    # C3
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v

    # close and re-open to check that we work with empty clock tables
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.close()
    c = connect(dbfile)
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v

    # insert so we get a clock entry
    c.execute("insert into foo values (1, 2)")
    c.commit()
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 1

    # Close and reopen to check that version was persisted and re-initialized correctly
    close(c)
    c = connect(dbfile)
    assert c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 1
    close(c)

# c4


def test_each_tx_gets_a_version():
    c = connect(":memory:")

    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.execute("insert into foo values (1, 2)")
    c.execute("insert into foo values (2, 2)")
    c.commit()
    c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 1

    c.execute("insert into foo values (3, 2)")
    c.execute("insert into foo values (4, 2)")
    c.commit()
    c.execute("SELECT crsql_db_version()").fetchone()[0] == min_db_v + 2

    close(c)
