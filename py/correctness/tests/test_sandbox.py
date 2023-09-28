from crsql_correctness import connect, close, min_db_v
from pprint import pprint

# exploratory tests to debug changes


def sync_left_to_right(l, r, since):
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ? ORDER BY db_version, seq ASC", (since,))

    ret = 0
    for change in changes:
        ret = change[5]
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", change)

    r.commit()
    return ret


def test_sync():
    def setup():
        c = connect(":memory:")
        c.execute("CREATE TABLE item (id PRIMARY KEY NOT NULL, width INTEGER, height INTEGER, name TEXT, dscription TEXT, weight INTEGER)")
        c.execute("SELECT crsql_as_crr('item')")
        c.commit()
        return c

    def insert_item(c, args):
        c.execute("INSERT INTO item VALUES (?, ?, ?, ?, ?, ?)", args)
        c.commit()

    a = setup()
    b = setup()

    insert_item(a, ('9838abbe-6fa8-4755-af2b-9f0484888809',
                None, None, None, None, None))
    insert_item(b, ('f94ef174-459f-4b07-bc7a-c1104a97ceb5',
                None, None, None, None, None))

    since_a = sync_left_to_right(a, b, 0)

    a.execute("DELETE FROM item WHERE id = '9838abbe-6fa8-4755-af2b-9f0484888809'")
    a.commit()

    insert_item(a, ('d5653f10-b858-46c7-97e5-5660eca47d28',
                None, None, None, None, None))

    sync_left_to_right(a, b, since_a)
    sync_left_to_right(b, a, 0)

    # pprint("A")
    # pprint(a.execute("SELECT * FROM item").fetchall())
    # pprint("B")
    # pprint(b.execute("SELECT * FROM item").fetchall())

    # pprint("A changes")
    # pprint(a.execute("SELECT * FROM crsql_changes").fetchall())
