from crsql_correctness import connect, close, min_db_v
import shutil
from pprint import pprint


def test_can_load_v0_12_0():
    prefix = "./prior-dbs/v0.12.0"
    # copy the file given connecting might migrate it!
    shutil.copyfile(prefix + ".prior-db", prefix + ".db")
    c = connect(prefix + ".db")
    rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()
    assert (rows == [('foo', "'one'", 'b', '2', 1, 1, None, 0),
                     ('bar', '1', 'b', '2', 1, 2, None, 0)])

    version = c.execute(
        "SELECT value FROM crsql_master WHERE key ='crsqlite_version'").fetchone()
    assert (version[0] == 130000)
    close(c)


def test_can_load_v0_13_0():
    prefix = "./prior-dbs/v0.13.0"
    # copy the file given connecting might migrate it!
    shutil.copyfile(prefix + ".prior-db", prefix + ".db")
    c = connect(prefix + ".db")
    rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()
    assert (rows == [('foo', '1', 'b', '2', 1, 1, None, 0),
                     ('foo', '3', 'b', '4', 1, 2, None, 0),
                     ('foo', '5', 'b', '6', 1, 2, None, 1),
                     ('foo', '6', 'b', '7', 1, 2, None, 2),
                     ('foo', '8', 'b', '9', 1, 3, None, 0)])

    version = c.execute(
        "SELECT value FROM crsql_master WHERE key ='crsqlite_version'").fetchone()
    assert (version[0] == 130000)
    close(c)


def test_can_load_as_readonly():
    prefix = "./prior-dbs/v0.13.0"
    # copy the file given connecting might migrate it!
    shutil.copyfile(prefix + ".prior-db", prefix + ".db")
    c = connect('file:' + prefix + ".db?mode=ro", uri=True)
    # just expecting not to throw.
    close(c)
