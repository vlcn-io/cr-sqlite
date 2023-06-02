from crsql_correctness import connect, close
from hypothesis import given, settings, example
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids
from functools import reduce
import random
import pprint

INSERT = 0
UPDATE = 1
DELETE = 2
MAX_SIGNED_32BIT = 2147483647
MIN_SIGNED_32BIT = -2147483648

# CREATE TABLE item (id, width, height, name, description, weight)
COLUMN_TYPES = (
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    text(),
    text(),
    # floats seem to be able to loase precision in sync. We need to dig into this!
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT)
    # -1.1754943508222875e-38 vs
    # -1.1754943508222872e-38 was the failure seen.
    # floats
)

COLUMN_NAMES = (
    "width",
    "height",
    "name",
    "description",
    "weight"
)


@settings(max_examples=30)
@given(data())
def test_delta_sync(data):
    since_is_rowid = data.draw(booleans())

    def create_column_data(which_columns):
        return tuple(None if c == False else data.draw(COLUMN_TYPES[i]) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = data.draw(integers(0, 2))
        which_columns = (data.draw(booleans()), data.draw(booleans()), data.draw(
            booleans()), data.draw(booleans()), data.draw(booleans()))

        if op == INSERT:
            return (op, data.draw(uuids()), create_column_data(which_columns))

        if op == UPDATE:
            # force at least one column to true
            if not any(which_columns):
                temp = list(which_columns)
                temp[0] = True
                which_columns = tuple(temp)
            return (op, create_column_data(which_columns))

        return (op,)

    def make_script(x):
        length = data.draw(integers(0, 100))
        return list(map(gen_script_step, range(length)))

    def open_db(i):
        conn = connect(":memory:")
        conn.execute(
            "CREATE TABLE item (id PRIMARY KEY, width INTEGER, height INTEGER, name TEXT, description TEXT, weight INTEGER)")
        conn.execute("SELECT crsql_as_crr('item')")
        conn.commit()
        return (i, conn, dict())

    num_dbs = data.draw(integers(2, 5))
    dbs = list(map(open_db, range(num_dbs)))
    scripts = list(map(make_script, range(num_dbs)))

    total_steps = reduce(lambda l, r: l + len(r), scripts, 0)
    sync_chance = data.draw(integers(0, 19))

    for step_index in range(total_steps):
        for db, script in zip(dbs, scripts):
            if step_index >= len(script):
                continue
            run_step(db, script[step_index])
            if data.draw(integers(0, sync_chance)) == 0:
                sync_from_random_peers(data, db, dbs, since_is_rowid)

    sync_all(dbs, since_is_rowid)

    for i in range(0, len(dbs) - 1):
        conn1 = dbs[i][1]
        conn2 = dbs[i+1][1]

        assert (conn1.execute("SELECT * FROM item ORDER BY id ASC").fetchall() ==
                conn2.execute("SELECT * FROM item ORDER BY id ASC").fetchall())
    for db in dbs:
        close(db[1])


def run_step(db, step):
    op = step[0]
    conn = db[1]

    def get_column_names_values(column_data):
        column_values = [x for x in column_data if x is not None]
        column_names = [x for x in list(
            None if column_data[i] is None else name for i, name in enumerate(COLUMN_NAMES)) if x is not None]
        return (column_names, column_values)

    if op == INSERT:
        id = step[1]
        column_data = step[2]

        (column_names, column_values) = get_column_names_values(column_data)
        column_placeholders = ["?" for x in column_values]

        sql = "INSERT INTO item ({}) VALUES ({})".format(
            ", ".join(["id"] + column_names), ", ".join(["?"] + column_placeholders))
        conn.execute(sql, tuple([str(id)] + column_values))
        conn.commit()
    if op == UPDATE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY RANDOM() LIMIT 1;").fetchone()
        if row is None:
            return

        column_data = step[1]

        (column_names, column_values) = get_column_names_values(column_data)
        set_statements = ["{} = ?".format(x) for x in column_names]

        conn.execute("UPDATE item SET {} WHERE id = ?".format(
            ", ".join(set_statements)), tuple([row[0]] + column_values))
        conn.commit()
    if op == DELETE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY RANDOM() LIMIT 1;").fetchone()
        if row is None:
            return

        conn.execute("DELETE FROM item WHERE id = ?", row)
        conn.commit()

# run up and back down


def sync_all(dbs, since_is_rowid):
    # 0 pulls from everyone
    # then everyone pulls from 0
    # TODO: also test other topologies
    pull_from_dbids = list(range(1, len(dbs)))
    db0 = dbs[0]

    peer_tracker = db0[2]
    conn = db0[1]

    for pull_from in pull_from_dbids:
        since = peer_tracker.get(pull_from, 0)
        new_since = sync_left_to_right(
            dbs[pull_from][1], conn, since, since_is_rowid)
        peer_tracker[pull_from] = new_since

    for push_to in pull_from_dbids:
        push_to_db = dbs[push_to]
        peer_tracker = push_to_db[2]
        push_to_conn = push_to_db[1]
        since = peer_tracker.get(0, 0)

        sync_left_to_right(conn, push_to_conn, since, since_is_rowid)


def sync_from_random_peers(data, db, dbs, since_is_rowid):
    peer_tracker = db[2]
    conn = db[1]
    dbid = db[0]

    dbids = list(range(len(dbs)))
    # don't sync with self
    dbids.remove(dbid)

    # pull 1-n other dbids to pull from
    pull_from_dbids = random.choices(
        dbids, k=data.draw(integers(1, len(dbids))))

    for pull_from in pull_from_dbids:
        since = peer_tracker.get(pull_from, 0)
        new_since = sync_left_to_right(
            dbs[pull_from][1], conn, since, since_is_rowid)
        peer_tracker[pull_from] = new_since


def sync_left_to_right(l, r, since, since_is_rowid):
    if since_is_rowid:
        changes = l.execute(
            "SELECT *, rowid FROM crsql_changes WHERE rowid > ?", (since,))
    else:
        changes = l.execute(
            "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))

    ret = 0
    for change in changes:
        if since_is_rowid:
            temp = list(change)
            ret = temp.pop()
            change = tuple(temp)
        else:
            ret = change[5]
        r.execute("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)", change)

    r.commit()
    return ret

# We want to:
# 1. spin up 10 databases
# 2. Have them randomly insert/update/delete items
# 3. Periodically sync between peers
# 4. Do a full sync amongst the entire set
# 5. Check that all DBs have the same state

# For the operations, we can generate a script.
# Each node should follow a different script.
# That script looks like:
# OP[]
# type OP = {
#  name: INSERT
#  id: UUID
#  columns: [random vals]
# } | {
#  name: UPDATE -- no id, we'll select some random row from the table to update
#  columns: [random vals]
# } | {
#  name: DELETE -- no id again, just like update
# }
