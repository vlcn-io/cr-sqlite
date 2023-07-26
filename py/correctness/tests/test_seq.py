from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def sync_left_to_right(l, r):
    changes = l.execute("SELECT * FROM crsql_changes")
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def test_increments_by_one_in_tx():
    c = connect(":memory:")
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO foo VALUES (2, 3)")
    c.commit()

    rows = c.execute("SELECT __crsql_seq FROM foo__crsql_clock").fetchall()
    assert (rows == [(0,), (1,), (2,), (3,)])


def test_resets_on_every_tx():
    c = connect(":memory:")
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO foo VALUES (2, 3)")
    c.commit()

    rows = c.execute("SELECT __crsql_seq FROM foo__crsql_clock").fetchall()
    assert (rows == [(0,), (1,), (2,), (3,)])

    c.execute("INSERT INTO foo VALUES (3, 4)")
    c.execute("INSERT INTO foo VALUES (5, 6)")
    c.commit()

    rows = c.execute("SELECT __crsql_seq FROM foo__crsql_clock").fetchall()
    assert (rows == [(0,), (1,), (2,), (3,), (0,), (1,), (2,), (3,)])


def test_preserved_on_merge():
    # the order we insert changes into crsql_changes should be the order they come back out when using seq
    c = connect(":memory:")
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.commit()

    c2 = connect(":memory:")
    c2.execute("create table foo (id primary key, a)")
    c2.execute("select crsql_as_crr('foo')")
    c2.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO foo VALUES (2, 3)")
    c.execute("INSERT INTO foo VALUES (3, 4)")
    c.execute("INSERT INTO foo VALUES (5, 6)")
    c.execute("UPDATE foo SET a = 1 WHERE id = 1")
    c.execute("DELETE FROM foo WHERE id = 2")
    c.commit()

    sync_left_to_right(c, c2)
    c_rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()
    c2_rows = c.execute("SELECT *, seq FROM crsql_changes").fetchall()

    assert (c_rows == c2_rows)


def test_incr_by_one():
    # insert
    # update
    # delete
    c = connect(":memory:")
    c.execute("create table foo (a primary key, b, c, d)")
    c.execute("select crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2, 3, 4)")
    c.execute("INSERT INTO foo VALUES (2, 2, 3, 4)")
    c.execute("INSERT INTO foo VALUES (3, 2, 3, 4)")
    c.commit()

    rows = c.execute(
        "SELECT seq FROM crsql_changes WHERE db_version = 1").fetchall()

    assert (rows == [(0,), (1,), (2,), (3,), (4,),
            (5,), (6,), (7,), (8,), (9,), (10,), (11,)])

    c.execute("UPDATE foo SET c = 'c', d = 'd' WHERE a = 1")
    c.execute("UPDATE foo SET c = 'c', d = 'd' WHERE a = 2")
    c.execute("UPDATE foo SET c = 'c', d = 'd' WHERE a = 3")
    c.commit()

    rows = c.execute(
        "SELECT seq FROM crsql_changes WHERE db_version = 2").fetchall()
    assert (rows == [(0,), (1,), (2,), (3,), (4,), (5,)])

    c.execute("UPDATE foo SET b = 'b' WHERE a = 1")
    c.execute("UPDATE foo SET b = 'b' WHERE a = 2")
    c.execute("UPDATE foo SET b = 'b' WHERE a = 3")
    c.commit()
    rows = c.execute(
        "SELECT seq FROM crsql_changes WHERE db_version = 3").fetchall()
    assert (rows == [(0,), (1,), (2,)])

    c.execute("DELETE FROM foo")
    c.commit()

    rows = c.execute("SELECT seq FROM crsql_changes").fetchall()
    assert (rows == [(0,), (1,), (2,)])

    c.execute("create table bar (a primary key, b);")
    c.execute("select crsql_as_crr('bar')")
    c.commit()

    c.execute("INSERT INTO bar VALUES (1, 2)")
    c.execute("INSERT INTO bar VALUES (3, 4)")
    c.commit()

    c.execute("UPDATE bar SET b = 'b' WHERE a = 1")
    c.execute("UPDATE bar SET b = 'b' WHERE a = 3")
    c.commit()

    rows = c.execute(
        "SELECT __crsql_db_version, __crsql_seq FROM bar__crsql_clock ORDER BY __crsql_db_version ASC").fetchall()
    assert (rows == [(5, 0), (5, 2), (6, 0), (6, 1)])

    # test update of pk vals with col vals

    c.execute("CREATE TABLE baz (a primary key)")
    c.execute("SELECT crsql_as_crr('baz')")
    c.commit()
    c.execute("INSERT INTO baz VALUES (1)")
    c.execute("INSERT INTO baz VALUES (2)")
    c.commit()

    rows = c.execute("SELECT __crsql_seq FROM baz__crsql_clock").fetchall()
    assert (rows == [(0,), (1,)])

    c.execute("UPDATE baz SET a = 11 WHERE a = 1")
    c.execute("UPDATE baz SET a = 22 WHERE a = 2")
    c.commit()
    rows = c.execute(
        "SELECT __crsql_seq FROM baz__crsql_clock ORDER BY __crsql_db_version, __crsql_seq ASC").fetchall()
    assert (rows == [(0,), (1,), (2,), (3,)])

    # c.execute("DELETE FROM baz")

    # pprint(c.execute(
    #     "SELECT *, seq FROM crsql_changes WHERE [table] = 'baz'").fetchall())

# db is locked when doing concurrent writes so the following case cannot happen in SQLite
# def test_preserved_conc_transactions():
#     filename = "./test_preserved_conc_transactions.db"
#     try:
#         os.remove(filename)
#         os.remove("{}-wal".format(filename))
#         os.remove("{}-shm".format(filename))
#     except:
#         None

#     c1 = connect(filename)
#     c1.execute("PRAGMA journal_mode = WAL")
#     c1.execute("PRAGMA synchronous = NORMAL")
#     c2 = connect(filename)

#     c1.execute("create table foo (id primary key, a)")
#     c1.execute("select crsql_as_crr('foo')")
#     c1.commit()

#     c1.execute("INSERT INTO foo VALUES (1, 2)")
#     c2.execute("INSERT INTO foo VALUES (11, 1)")
#     c1.execute("INSERT INTO foo VALUES (2, 3)")
#     c2.execute("INSERT INTO foo VALUES (12, 2)")
#     c1.commit()
#     c2.commit()

#     rows = c1.execute("SELECT __crsql_seq FROM foo__crsql_clock").fetchall()
#     pprint(rows)
