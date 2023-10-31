from crsql_correctness import connect, close, min_db_v
from pprint import pprint

# Test that no trigger are run during merging / sync bit is respected.
# How can we test this?
# 1. We can install our own trigger which checks the sync bit and writes something
# 2. We can check that only the expected clock rows are written?


def create_db():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a PRIMARY KEY NOT NULL, b)")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()
    return c


def test_insert_row():
    # db version, seq, col version, site id, cl should all be from the insertion
    c = create_db()
    c.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 4, 4, x'1dc8d6bb7f8941088327d9439a7927a4', 3, 6)")
    c.commit()

    changes = c.execute("SELECT * FROM crsql_changes").fetchall()
    # what we wrote should be what we get back
    assert (changes == [('foo',
                         b'\x01\t\x01',
                         '-1',
                         None,
                         3,
                         4,
                         b"\x1d\xc8\xd6\xbb\x7f\x89A\x08\x83'\xd9C\x9ay'\xa4",
                         3,
                         6),
                        ('foo',
                         b'\x01\t\x01',
                         'b',
                         1,
                         4,
                         4,
                         b"\x1d\xc8\xd6\xbb\x7f\x89A\x08\x83'\xd9C\x9ay'\xa4",
                         3,
                         6)])


def test_update_row():
    c = create_db()
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()
    c.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 4, 4, x'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 3, 6)")
    changes = c.execute("SELECT * FROM crsql_changes").fetchall()
    # what we wrote should be what we get back since we win the merge
    assert (changes == [('foo',
                         b'\x01\t\x01',
                         '-1',
                         None,
                         3,
                         4,
                         b'\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff',
                         3,
                         6),
                        ('foo',
                         b'\x01\t\x01',
                         'b',
                         1,
                         4,
                         4,
                         b'\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff',
                         3,
                         6)])


def test_delete_row():
    c = create_db()
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()
    c.execute("INSERT INTO crsql_changes VALUES ('foo', x'010901', '-1', 1, 4, 4, x'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 4, 6)")
    c.commit()
    changes = c.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo',
                        b'\x01\t\x01',
                         '-1',
                         None,
                         4,
                         4,
                         b'\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff',
                         4,
                         6)])


def test_custom_trigger():
    c = create_db()
    c.execute("CREATE TABLE log (a integer primary key, b)")
    c.execute("""CREATE TRIGGER log_up AFTER INSERT ON foo WHEN crsql_internal_sync_bit() = 0 BEGIN
                INSERT INTO log (b) VALUES (1);
              END;""")
    c.commit()
    c.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010901', 'b', 1, 4, 4, x'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 3, 6)")
    c.commit()
    rows = c.execute("SELECT * FROM log").fetchall()
    assert (rows == [])
    rows = c.execute("SELECT * FROM foo").fetchall()
    assert (rows == [(1, 1)])

    c.execute("INSERT INTO foo VALUES (5, 5)")
    c.commit()
    rows = c.execute("SELECT * FROM log").fetchall()
    assert (rows == [(1, 1)])

    c.commit()
    c.execute("DROP TRIGGER log_up")
    c.execute("""CREATE TRIGGER log_up AFTER INSERT ON foo WHEN crsql_internal_sync_bit() = 1 BEGIN
                INSERT INTO log (b) VALUES (1);
              END;""")
    c.commit()
    c.execute(
        "INSERT INTO crsql_changes VALUES ('foo', x'010902', 'b', 1, 4, 4, x'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 3, 6)")
    rows = c.execute("SELECT * FROM log").fetchall()
    assert (rows == [(1, 1), (2, 1)])
