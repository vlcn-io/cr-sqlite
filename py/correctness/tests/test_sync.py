from crsql_correctness import connect, close, min_db_v
import pprint

# js_tests includes a Fast-Check driven merge test which is much more complete than what we have here


def init():
    dbs = list(map(lambda c: connect(":memory:"), range(3)))

    for db in dbs:
        create_schema(db)

    for db in dbs:
        insert_data(db)

    return dbs


def sync_left_to_right(l, r, since):
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))
    for change in changes:
        r.execute("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()
    None


def create_schema(c):
    c.execute("CREATE TABLE \"user\" (id primary key, name)")
    c.execute("CREATE TABLE deck (id primary key, owner_id, title)")
    c.execute("CREATE TABLE slide (id primary key, deck_id, \"order\")")
    c.execute("CREATE TABLE component (id primary key, type, slide_id, content)")

    c.execute("select crsql_as_crr('user')")
    c.execute("select crsql_as_crr('deck')")
    c.execute("select crsql_as_crr('slide')")
    c.execute("select crsql_as_crr('component')")


def insert_data(c):
    c.execute("INSERT INTO user VALUES (1, 'Javi')")
    c.execute("INSERT INTO deck VALUES (1, 1, 'Preso')")

    c.execute("INSERT INTO slide VALUES (1, 1, 0)")
    c.execute("INSERT INTO component VALUES (1, 'text', 1, 'wootwoot')")
    c.execute("INSERT INTO component VALUES (2, 'text', 1, 'toottoot')")
    c.execute("INSERT INTO component VALUES (3, 'text', 1, 'footfoot')")

    c.execute("INSERT INTO slide VALUES (2, 1, 1)")
    c.execute("INSERT INTO slide VALUES (3, 1, 2)")

    c.commit()


def update_data(c):
    c.execute("UPDATE user SET name = 'Maestro' WHERE id = 1")
    c.execute("UPDATE deck SET title = 'Presto' WHERE id = 1")
    c.commit()


def delete_data(c):
    c.execute("DELETE FROM component WHERE id = 1")
    c.commit()


def get_changes_since(c, version, requestor):
    return c.execute(
        "SELECT * FROM crsql_changes WHERE db_version > {v} AND site_id IS NOT X'{r}'".format(
            v=version, r=requestor)
    ).fetchall()


def apply_patches():
    return 1


def test_changes_since():
    dbs = init()

    rows = get_changes_since(dbs[0], 0, "FF")
    # siteid = dbs[0].execute("select crsql_siteid()").fetchone()[0]
    siteid = None
    expected = [
        ("component", "1", "content", "'wootwoot'", 1, 1, siteid),
        ("component", "1", "slide_id", "1", 1, 1, siteid),
        ("component", "1", "type", "'text'", 1, 1, siteid),
        ("component", "2", "content", "'toottoot'", 1, 1, siteid),
        ("component", "2", "slide_id", "1", 1, 1, siteid),
        ("component", "2", "type", "'text'", 1, 1, siteid),
        ("component", "3", "content", "'footfoot'", 1, 1, siteid),
        ("component", "3", "slide_id", "1", 1, 1, siteid),
        ("component", "3", "type", "'text'", 1, 1, siteid),
        ("deck", "1", "owner_id", "1", 1, 1, siteid),
        ("deck", "1", "title", "'Preso'", 1, 1, siteid),
        ("slide", "1", "deck_id", "1", 1, 1, siteid),
        ("slide", "1", "order", "0", 1, 1, siteid),
        ("slide", "2", "deck_id", "1", 1, 1, siteid),
        ("slide", "2", "order", "1", 1, 1, siteid),
        ("slide", "3", "deck_id", "1", 1, 1, siteid),
        ("slide", "3", "order", "2", 1, 1, siteid),
        ("user", "1", "name", "'Javi'", 1, 1, siteid),
    ]

    # pprint.pprint(rows)
    assert (rows == expected)

    update_data(dbs[0])

    rows = get_changes_since(dbs[0], 1, 'FF')

    assert (rows == [("deck", "1", "title", "'Presto'", 2, 2,
            siteid), ("user", "1", "name", "'Maestro'", 2, 2, siteid)])


def test_delete():
    db = connect(":memory:")
    create_schema(db)
    insert_data(db)

    delete_data(db)

    rows = get_changes_since(db, 1, 'FF')
    siteid = None
    # Deletes are marked with a sentinel id
    assert (rows == [('component', '1', '__crsql_del', None, 1, 2, siteid)])

    db.execute("DELETE FROM component")
    db.execute("DELETE FROM deck")
    db.execute("DELETE FROM slide")
    db.commit()

    rows = get_changes_since(db, 0, 'FF')
    # pprint.pprint(rows)
    # TODO: we should have the network layer collapse these events or do it ourselves.
    # given we have past events that we're missing data for, they're now marked off as deletes
    # TODO: should deletes not get a proper version? Would be better for ordering and chunking replications
    assert (rows == [
        ("component", "1", "__crsql_del", None, 1, 1, siteid),
        ("component", "1", "__crsql_del", None, 1, 1, siteid),
        ("component", "1", "__crsql_del", None, 1, 1, siteid),
        ("component", "2", "__crsql_del", None, 1, 1, siteid),
        ("component", "2", "__crsql_del", None, 1, 1, siteid),
        ("component", "2", "__crsql_del", None, 1, 1, siteid),
        ("component", "3", "__crsql_del", None, 1, 1, siteid),
        ("component", "3", "__crsql_del", None, 1, 1, siteid),
        ("component", "3", "__crsql_del", None, 1, 1, siteid),
        ("deck", "1", "__crsql_del", None, 1, 1, siteid),
        ("deck", "1", "__crsql_del", None, 1, 1, siteid),
        ("slide", "1", "__crsql_del", None, 1, 1, siteid),
        ("slide", "1", "__crsql_del", None, 1, 1, siteid),
        ("slide", "2", "__crsql_del", None, 1, 1, siteid),
        ("slide", "2", "__crsql_del", None, 1, 1, siteid),
        ("slide", "3", "__crsql_del", None, 1, 1, siteid),
        ("slide", "3", "__crsql_del", None, 1, 1, siteid),
        ("user", "1", "name", "'Javi'", 1, 1, siteid),
        ("component", "1", "__crsql_del", None, 1, 2, siteid),
        ("component", "2", "__crsql_del", None, 1, 3, siteid),
        ("component", "3", "__crsql_del", None, 1, 3, siteid),
        ("deck", "1", "__crsql_del", None, 1, 3, siteid),
        ("slide", "1", "__crsql_del", None, 1, 3, siteid),
        ("slide", "2", "__crsql_del", None, 1, 3, siteid),
        ("slide", "3", "__crsql_del", None, 1, 3, siteid)])

    # test insert

    # test pk only row(s)

    # test no change insert (settings values to what they were before)

    # test new table after a call to get_changes_since
    close(db)


# Row not exists case so entry created and default filled in
def test_merging_on_defaults():
    def create_db1():
        db1 = connect(":memory:")
        db1.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 0);")
        db1.execute("INSERT INTO foo (a) VALUES (1);")
        db1.execute("SELECT crsql_as_crr('foo');")
        db1.commit()
        return db1

    def create_db2():
        db2 = connect(":memory:")
        db2.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
        db2.execute("INSERT INTO foo VALUES (1, 2);")
        db2.execute("SELECT crsql_as_crr('foo');")
        db2.commit()
        return db2

    # test merging from thing with records (db2) to thing without records for default cols (db1)
    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db2, db1, 0)

    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    # pprint.pprint(changes)

    close(db1)
    close(db2)

    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db1, db2, 0)

    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # pprint.pprint(changes)

    # test merging from thing without records (db1) to thing with records (db2)

    # test merging between two dbs both which have no records for the default thing

    # if the merge creates a new row will default still correctly lose even if it would win on value?

    # try again but with a default value and where that default is larger that the value a user explicitly set...
    # should not the default be retained in that case? Under normal rules but the new rules are:
    # tie goes to greatest value unless that value is default then default is overruled.

    None


def test_merging_on_defaults2():
    def create_db1():
        db1 = connect(":memory:")
        db1.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 0);")
        db1.execute("SELECT crsql_as_crr('foo');")
        db1.commit()

        db1.execute("INSERT INTO foo (a) VALUES (1);")
        db1.commit()

        db1.execute("SELECT crsql_begin_alter('foo')")
        db1.execute("ALTER TABLE foo ADD COLUMN c DEFAULT 0;")
        db1.execute("SELECT crsql_commit_alter('foo')")
        db1.commit()
        return db1

    def create_db2():
        db2 = connect(":memory:")
        db2.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 0);")
        db2.execute("SELECT crsql_as_crr('foo');")
        db2.commit()

        db2.execute("SELECT crsql_begin_alter('foo')")
        db2.execute("ALTER TABLE foo ADD COLUMN c DEFAULT 0;")
        db2.execute("SELECT crsql_commit_alter('foo')")
        db2.commit()

        db2.execute("INSERT INTO foo (a,b,c) VALUES (1,2,3);")
        db2.commit()
        return db2

    # test merging from thing with records (db2) to thing without records for default cols (db1)
    db1 = create_db1()
    db2 = create_db2()

    pprint.pprint(db1.execute("SELECT * FROM foo__crsql_clock").fetchall())

    sync_left_to_right(db2, db1, 0)

    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    pprint.pprint(changes)

    close(db1)
    close(db2)

    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db1, db2, 0)

    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    pprint.pprint(changes)

# Row exists but col added thus no defaults backfilled

# We have a comprehensive merge test in nodejs. We should port it to python at some point and
# keep all our correctness tests here.


def test_merge():
    dbs = init()

    dbs[0].execute("UPDATE deck SET title = 'a' WHERE id = 1")
    dbs[1].execute("UPDATE deck SET title = 'b' WHERE id = 1")
    dbs[2].execute("UPDATE deck SET title = 'c' WHERE id = 1")

    for c in dbs:
        close(c)

    # test delete
    # test pk only
    # test create
    # test update
