from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def sync_left_to_right(l, r, since):
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()

# Sentinel is omitted on initial
# INSERT

# Sentinel is created on delete

# Sentinel is omitted on re-insertion of already existing thing either update replace or insert replace

# Sentinel, if exists, is not bumped on insert replace?? to keep behavior of the case when it doesn't exist?

# Sentinel not created by merge unless a sentinel is present in the merge data


def make_simple_schema():
    c = connect(":memory:")
    c.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, [text] TEXT);")
    c.execute("SELECT crsql_as_crr('test')")
    c.execute("CREATE TABLE test2 (id INTEGER PRIMARY KEY, [text] TEXT);")
    c.execute("SELECT crsql_as_crr('test2')")
    c.commit()
    return c


def make_data(c):
    for n in range(0, 200):
        c.execute("INSERT INTO test (id, text) VALUES (?, ?)",
                  (n, "hello {}".format(n)))
        c.execute("INSERT INTO test2 (id, text) VALUES (?, ?)",
                  (n, "hello {}".format(n)))
        c.execute("INSERT INTO test (id, text) VALUES (?, ?)",
                  (n + 10000, "hello {}".format(n)))
        c.execute("INSERT INTO test2 (id, text) VALUES (?, ?)",
                  (n + 10000, "hello {}".format(n)))
        c.commit()

# https://discord.com/channels/989870439897653248/989870440585494530/1137099971284435124


def test_omitted_on_insert():
    c = make_simple_schema()
    make_data(c)

    assert (c.execute(
        "SELECT count(*) FROM crsql_changes WHERE cid = '-1'").fetchone()[0] == 0)


def test_created_on_delete():
    c = make_simple_schema()

    make_data(c)

    c.execute("DELETE FROM test")
    c.execute("DELETE FROM test2")
    c.commit()

    assert (c.execute(
        "SELECT count(*) FROM crsql_changes WHERE cid = '-1'").fetchone()[0] == 800)


def test_not_created_on_replace():
    c = make_simple_schema()
    make_data(c)

    for n in range(0, 200):
        c.execute("INSERT OR REPLACE INTO test (id, text) VALUES (?, ?)",
                  (n, "hello {}".format(n)))
        c.execute("INSERT OR REPLACE INTO test2 (id, text) VALUES (?, ?)",
                  (n, "hello {}".format(n)))
        c.execute("INSERT OR REPLACE INTO test (id, text) VALUES (?, ?)",
                  (n + 10000, "hello {}".format(n)))
        c.execute("INSERT OR REPLACE INTO test2 (id, text) VALUES (?, ?)",
                  (n + 10000, "hello {}".format(n)))
        c.commit()

    assert (c.execute(
        "SELECT count(*) FROM crsql_changes WHERE cid = '-1'").fetchone()[0] == 0)


def test_not_created_on_merge():
    a = make_simple_schema()
    b = make_simple_schema()
    make_data(a)

    sync_left_to_right(a, b, 0)

    assert (a.execute(
        "SELECT count(*) FROM crsql_changes WHERE cid = '-1'").fetchone()[0] == 0)
    assert (b.execute(
        "SELECT count(*) FROM crsql_changes WHERE cid = '-1'").fetchone()[0] == 0)


def test_not_created_on_noop_merge():
    None
