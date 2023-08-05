from crsql_correctness import connect, close, min_db_v
import pprint

# js_tests includes a Fast-Check driven merge test which is much more complete than what we have here
# test_sync_prop.py also include Hypothesis driven tests


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
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


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
    # siteid = dbs[0].execute("select crsql_site_id()").fetchone()[0]
    siteid = None
    expected = [('user', b'\x01\t\x01', 'name', 'Javi', 1, 1, None, 1),
                ('deck', b'\x01\t\x01', 'owner_id', 1, 1, 1, None, 1),
                ('deck', b'\x01\t\x01', 'title', 'Preso', 1, 1, None, 1),
                ('slide', b'\x01\t\x01', 'deck_id', 1, 1, 1, None, 1),
                ('slide', b'\x01\t\x01', 'order', 0, 1, 1, None, 1),
                ('component', b'\x01\t\x01', 'type', 'text', 1, 1, None, 1),
                ('component', b'\x01\t\x01', 'slide_id', 1, 1, 1, None, 1),
                ('component', b'\x01\t\x01', 'content', 'wootwoot', 1, 1, None, 1),
                ('component', b'\x01\t\x02', 'type', 'text', 1, 1, None, 1),
                ('component', b'\x01\t\x02', 'slide_id', 1, 1, 1, None, 1),
                ('component', b'\x01\t\x02', 'content', 'toottoot', 1, 1, None, 1),
                ('component', b'\x01\t\x03', 'type', 'text', 1, 1, None, 1),
                ('component', b'\x01\t\x03', 'slide_id', 1, 1, 1, None, 1),
                ('component', b'\x01\t\x03', 'content', 'footfoot', 1, 1, None, 1),
                ('slide', b'\x01\t\x02', 'deck_id', 1, 1, 1, None, 1),
                ('slide', b'\x01\t\x02', 'order', 1, 1, 1, None, 1),
                ('slide', b'\x01\t\x03', 'deck_id', 1, 1, 1, None, 1),
                ('slide', b'\x01\t\x03', 'order', 2, 1, 1, None, 1)]

    assert (rows == expected)

    update_data(dbs[0])

    rows = get_changes_since(dbs[0], 1, 'FF')

    assert (rows == [('user', b'\x01\x09\x01', 'name', "Maestro", 2, 2, None, 1),
                     ('deck', b'\x01\x09\x01', 'title', "Presto", 2, 2, None, 1)])


def test_delete():
    db = connect(":memory:")
    create_schema(db)
    insert_data(db)

    delete_data(db)

    rows = get_changes_since(db, 1, 'FF')
    siteid = None
    # Deletes are marked with a sentinel id
    assert (rows == [('component', b'\x01\x09\x01',
            '-1', None, 2, 2, siteid, 2)])

    db.execute("DELETE FROM component")
    db.execute("DELETE FROM deck")
    db.execute("DELETE FROM slide")
    db.commit()

    rows = get_changes_since(db, 0, 'FF')
    # TODO: should deletes not get a proper version? Would be better for ordering and chunking replications
    assert (rows == [('user', b'\x01\t\x01', 'name', 'Javi', 1, 1, None, 1),
                     ('component', b'\x01\t\x01', '-1', None, 2, 2, None, 2),
                     ('component', b'\x01\t\x02', '-1', None, 2, 3, None, 2),
                     ('component', b'\x01\t\x03', '-1', None, 2, 3, None, 2),
                     ('deck', b'\x01\t\x01', '-1', None, 2, 3, None, 2),
                     ('slide', b'\x01\t\x01', '-1', None, 2, 3, None, 2),
                     ('slide', b'\x01\t\x02', '-1', None, 2, 3, None, 2),
                     ('slide', b'\x01\t\x03', '-1', None, 2, 3, None, 2)])

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
        db2.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 0);")
        db2.execute("INSERT INTO foo VALUES (1, 2);")
        db2.execute("SELECT crsql_as_crr('foo');")
        db2.commit()
        return db2

    # test merging from thing with records (db2) to thing without records for default cols (db1)
    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db2, db1, 0)
    # db1 has changes from db2
    # db2 set b to 2 this should be the winner
    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    # w a db version change since a write happened
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 2, None, 1)])

    close(db1)
    close(db2)

    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db1, db2, 0)

    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # db1 into db2
    # db2 should still win w. no db version change since no write happened
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1)])

    # test merging from thing without records (db1) to thing with records (db2)

    # test merging between two dbs both which have no records for the default thing

    # if the merge creates a new row will default still correctly lose even if it would win on value?

    # try again but with a default value and where that default is larger that the value a user explicitly set...
    # should not the default be retained in that case? Under normal rules but the new rules are:
    # tie goes to greatest value unless that value is default then default is overruled.

    None


# DB2 will set a value for the col that is a default
# this value will be less than the default
def test_merging_larger_backfilled_default():
    def create_dbs():
        db1 = connect(":memory:")
        db1.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 4);")
        db1.execute("INSERT INTO foo (a) VALUES (1);")
        db1.execute("SELECT crsql_as_crr('foo');")
        db1.commit()

        db2 = connect(":memory:")
        db2.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 4);")
        db2.execute("SELECT crsql_as_crr('foo');")
        db2.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db2.commit()

        return (db1, db2)

    (db1, db2) = create_dbs()

    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # db version is pushed since 4 wins the col_version tie
    # col version stays since 1 is the max of winner and loser.
    assert (changes == [('foo', b'\x01\t\x01', 'b', 4, 1, 2, None, 1)])


def test_merging_larger():
    None


# We had a case where we set `VALUE` in `crsql_master` to `TEXT` type
# this would cause db versions to get stuck if we required tracking a version
# post compaction.
def test_db_version_moves_as_expected_post_alter():
    db = connect(":memory:")
    db.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
    db.execute("SELECT crsql_as_crr('foo');")
    db.commit()

    db.execute("INSERT INTO foo (a, b) VALUES (1, 2);")
    db.commit()

    db.execute("SELECT crsql_begin_alter('foo');")
    db.execute("ALTER TABLE foo ADD COLUMN c;")
    db.execute("SELECT crsql_commit_alter('foo');")
    db.commit()

    db.execute("INSERT INTO foo (a, b, c) VALUES (2, 3, 4);")
    db.commit()
    db.execute("INSERT INTO foo (a, b, c) VALUES (3, 4, 5);")
    db.commit()
    db.execute("INSERT INTO foo (a, b, c) VALUES (4, 4, 5);")
    db.commit()

    changes = db.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1),
                        ('foo', b'\x01\t\x02', 'b', 3, 1, 2, None, 1),
                        ('foo', b'\x01\t\x02', 'c', 4, 1, 2, None, 1),
                        ('foo', b'\x01\t\x03', 'b', 4, 1, 3, None, 1),
                        ('foo', b'\x01\t\x03', 'c', 5, 1, 3, None, 1),
                        ('foo', b'\x01\t\x04', 'b', 4, 1, 4, None, 1),
                        ('foo', b'\x01\t\x04', 'c', 5, 1, 4, None, 1)])


# DB1 has a row with no clock records (added during schema modification)
# DB2 has a row with all columns having clock records since value was set explicityl
# The default value with no records should always be overridden in all cases
def test_merging_on_defaults2():
    def create_db1():
        db1 = connect(":memory:")
        db1.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 4);")
        db1.execute("SELECT crsql_as_crr('foo');")
        db1.commit()

        db1.execute("INSERT INTO foo (a) VALUES (1);")
        db1.commit()

        db1.execute("SELECT crsql_begin_alter('foo')")
        # Test with higher than incoming value and lower than incoming value
        # defaults
        db1.execute("ALTER TABLE foo ADD COLUMN c DEFAULT 0;")
        db1.execute("SELECT crsql_commit_alter('foo')")
        db1.commit()
        return db1

    def create_db2():
        db2 = connect(":memory:")
        db2.execute("CREATE TABLE foo (a PRIMARY KEY, b DEFAULT 4);")
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

    sync_left_to_right(db2, db1, 0)

    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 4, 1, 1, None, 1),
                        ('foo', b'\x01\t\x01', 'c', 3, 1, 2, None, 1)])

    close(db1)
    close(db2)

    db1 = create_db1()
    db2 = create_db2()

    sync_left_to_right(db1, db2, 0)

    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [  # db2 c 3 wins given columns with no value after an alter
        # do no merging
        ('foo', b'\x01\t\x01', 'c', 3, 1, 1, None, 1),
        # Move db version since b lost on db2.
        # b had the value 2 on db2.
        ('foo', b'\x01\t\x01', 'b', 4, 1, 2, None, 1)])


def create_basic_db():
    db = connect(":memory:")
    db.execute("CREATE TABLE foo (a PRIMARY KEY, b);")
    db.execute("SELECT crsql_as_crr('foo');")
    db.commit()
    return db


def test_merge_same():
    def make_dbs():
        db1 = create_basic_db()
        db2 = create_basic_db()

        db1.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db1.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db2.commit()
        return (db1, db2)

    (db1, db2) = make_dbs()
    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # all at base version
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1)])

    (db1, db2) = make_dbs()
    sync_left_to_right(db2, db1, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # all at base version
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1)])


def test_merge_matching_clocks_lesser_value():
    def make_dbs():
        db1 = create_basic_db()
        db2 = create_basic_db()

        db1.execute("INSERT INTO foo (a,b) VALUES (1,1);")
        db1.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db2.commit()
        return (db1, db2)

    (db1, db2) = make_dbs()
    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    # no change since incoming is lesser
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 1, None, 1)])

    (db1, db2) = make_dbs()
    sync_left_to_right(db2, db1, 0)
    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    # change since incoming is greater
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 1, 2, None, 1)])


def test_merge_larger_clock_larger_value():
    def make_dbs():
        db1 = create_basic_db()
        db2 = create_basic_db()

        db1.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db1.commit()
        db1.execute("UPDATE foo SET b = 3 WHERE a = 1;")
        db1.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,1);")
        db2.commit()
        return (db1, db2)

    (db1, db2) = make_dbs()
    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 3, 2, 2, None, 1)])

    (db1, db2) = make_dbs()
    sync_left_to_right(db2, db1, 0)
    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 3, 2, 2, None, 1)])


def test_merge_larger_clock_smaller_value():
    def make_dbs():
        db1 = create_basic_db()
        db2 = create_basic_db()

        db1.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db1.commit()
        db1.execute("UPDATE foo SET b = 0 WHERE a = 1;")
        db1.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db2.commit()
        return (db1, db2)

    (db1, db2) = make_dbs()
    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 0, 2, 2, None, 1)])

    (db1, db2) = make_dbs()
    sync_left_to_right(db2, db1, 0)
    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 0, 2, 2, None, 1)])


def test_merge_larger_clock_same_value():
    def make_dbs():
        db1 = create_basic_db()
        db2 = create_basic_db()

        db1.execute("INSERT INTO foo (a,b) VALUES (1,1);")
        db1.commit()
        db1.execute("UPDATE foo SET b = 2 WHERE a = 1;")
        db1.commit()

        db2.execute("INSERT INTO foo (a,b) VALUES (1,2);")
        db2.commit()
        return (db1, db2)

    (db1, db2) = make_dbs()
    sync_left_to_right(db1, db2, 0)
    changes = db2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 2, 2, None, 1)])

    (db1, db2) = make_dbs()
    sync_left_to_right(db2, db1, 0)
    changes = db1.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', 'b', 2, 2, 2, None, 1)])

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
