from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def make_simple_schema():
    c = connect(":memory:")
    # O... so the type must be `ANY` for the orderable column for our triggers and the like to work...
    # we could cast the whatever to an int...
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY, spot TEXT, list)")
    c.execute("SELECT crsql_as_crr('foo')")
    c.execute("SELECT crsql_fract_as_ordered('foo', 'spot', 'list')")
    c.commit()
    return c


def test_first_insertion_prepend():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (1, -1, 'a')")
    c.commit()

    rows = c.execute("SELECT * FROM foo").fetchall()
    assert (rows == [(1, 'a ', 'a')])


def test_first_insertion_append():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (1, 1, 'a')")
    c.commit()

    rows = c.execute("SELECT * FROM foo").fetchall()
    assert (rows == [(1, 'a ', 'a')])


def test_middle_insertion():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (1, -1, 'list')")
    c.execute("INSERT INTO foo VALUES (3, 1, 'list')")
    c.execute("INSERT INTO foo_fractindex (a, list, after_a) VALUES (2, 'list', 1)")
    c.commit()

    rows = c.execute("SELECT * FROM foo ORDER BY spot ASC").fetchall()
    assert (rows == [(1, 'a ', 'list'), (2, 'a P', 'list'), (3, 'a!', 'list')])


def test_front_insertion():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (2, -1, 'list')")
    c.execute("INSERT INTO foo VALUES (3, 1, 'list')")
    c.execute(
        "INSERT INTO foo_fractindex (a, list, after_a) VALUES (1, 'list', NULL)")
    c.commit()

    rows = c.execute("SELECT * FROM foo ORDER BY spot ASC").fetchall()
    assert ([(1, 'Z~', 'list'), (2, 'a ', 'list'), (3, 'a!', 'list')] == rows)


def test_endinsertion():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (1, -1, 'list')")
    c.execute("INSERT INTO foo VALUES (2, 1, 'list')")
    c.execute(
        "INSERT INTO foo_fractindex (a, list, after_a) VALUES (3, 'list', 2)")
    c.commit()

    rows = c.execute("SELECT * FROM foo ORDER BY spot ASC").fetchall()
    assert (rows == [(1, 'a ', 'list'), (2, 'a!', 'list'), (3, 'a"', 'list')])


def test_view_first_insertion():
    c = make_simple_schema()
    c.execute(
        "INSERT INTO foo_fractindex (a, list, after_a) VALUES (1, 'list', NULL)")
    c.commit()

    rows = c.execute("SELECT * FROM foo").fetchall()
    assert (rows == [(1, 'a ', 'list')])


def test_view_move():
    c = make_simple_schema()
    c.execute("INSERT INTO foo VALUES (1, 1, 'list')")
    c.execute("INSERT INTO foo VALUES (2, 1, 'list')")
    c.execute("INSERT INTO foo VALUES (3, 1, 'list')")
    c.commit()

    # move 3 to be after 1
    c.execute("UPDATE foo_fractindex SET after_a = 1 WHERE a = 3")
    c.commit()
    rows = c.execute("SELECT * FROM foo ORDER BY spot ASC").fetchall()
    assert (rows == [(1, 'a ', 'list'), (3, 'a P', 'list'), (2, 'a!', 'list')])
