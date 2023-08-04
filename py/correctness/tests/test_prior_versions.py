from crsql_correctness import connect, close, min_db_v
import shutil
from pprint import pprint


# We no longer support these versions.
# def test_can_load_v0_12_0():
#     prefix = "./prior-dbs/v0.12.0"
#     # copy the file given connecting might migrate it!
#     shutil.copyfile(prefix + ".prior-db", prefix + ".db")
#     c = connect(prefix + ".db")
#     rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()
#     assert (rows == [('foo', b'\x01\x0b\x03one', '-1', None, 1, 0, None, 1, 0),
#                      ('bar', b'\x01\t\x01', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\x0b\x03one', 'b', 2, 1, 1, None, 1, 0),
#                      ('bar', b'\x01\t\x01', 'b', 2, 1, 2, None, 1, 0)])

#     version = c.execute(
#         "SELECT value FROM crsql_master WHERE key ='crsqlite_version'").fetchone()
#     assert (version[0] == 150000)
#     close(c)


# def test_can_load_v0_13_0():
#     prefix = "./prior-dbs/v0.13.0"
#     # copy the file given connecting might migrate it!
#     shutil.copyfile(prefix + ".prior-db", prefix + ".db")
#     c = connect(prefix + ".db")
#     rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()
#     assert (rows == [('foo', b'\x01\t\x01', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\t\x03', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\t\x05', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\t\x06', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\t\x08', '-1', None, 1, 0, None, 1, 0),
#                      ('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1, 0),
#                      ('foo', b'\x01\t\x03', 'b', 4, 1, 2, None, 1, 0),
#                      ('foo', b'\x01\t\x05', 'b', 6, 1, 2, None, 1, 1),
#                      ('foo', b'\x01\t\x06', 'b', 7, 1, 2, None, 1, 2),
#                      ('foo', b'\x01\t\x08', 'b', 9, 1, 3, None, 1, 0)])

#     version = c.execute(
#         "SELECT value FROM crsql_master WHERE key ='crsqlite_version'").fetchone()
#     assert (version[0] == 150000)
#     close(c)


def test_can_load_as_readonly():
    prefix = "./prior-dbs/v0.15.0"
    # copy the file given connecting might migrate it!
    shutil.copyfile(prefix + ".prior-db", prefix + ".db")
    c = connect('file:' + prefix + ".db?mode=ro", uri=True)
    # just expecting not to throw.
    close(c)
