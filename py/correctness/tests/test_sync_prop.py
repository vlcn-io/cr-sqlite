from crsql_correctness import connect, close
from hypothesis import given, settings, example
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids, characters, composite
from functools import reduce
import random
import pprint
import uuid

INSERT = 0
UPDATE = 1
DELETE = 2
MAX_SIGNED_32BIT = 2147483647
MIN_SIGNED_32BIT = -2147483648

# CREATE TABLE item (id, width, height, name, description, weight)
COLUMN_TYPES = (
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    text(characters(min_codepoint=0x0020, max_codepoint=0x27BF)),
    text(characters(min_codepoint=0x0020, max_codepoint=0x27BF)),
    # floats seem to be able to lose precision in sync. We need to dig into this!
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


@composite
def full_script(draw):
    def create_column_data(which_columns):
        return tuple(None if c == False else draw(COLUMN_TYPES[i]) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = draw(integers(0, 2))
        which_columns = (draw(booleans()), draw(booleans()), draw(
            booleans()), draw(booleans()), draw(booleans()))
        should_sync = draw(integers(0, 10)) == 0
        num_peers_to_sync = None
        if should_sync:
            num_peers_to_sync = draw(integers(1, num_dbs))

        if op == INSERT:
            return (op, str(uuid.uuid4()), create_column_data(which_columns), num_peers_to_sync)

        if op == UPDATE:
            # force at least one column to true
            if not any(which_columns):
                temp = list(which_columns)
                temp[0] = True
                which_columns = tuple(temp)
            return (op, create_column_data(which_columns), num_peers_to_sync)

        # DELETE
        return (op, num_peers_to_sync)

    def make_script(x):
        length = draw(integers(0, 100))
        return list(map(gen_script_step, range(length)))

    num_dbs = draw(integers(2, 5))
    scripts = list(map(make_script, range(num_dbs)))
    total_steps = reduce(lambda l, r: l + len(r), scripts, 0)

    return (num_dbs, scripts, total_steps)


# @reproduce_failure('6.75.9', b'AXicY2BWYxgF5AMANDEAKg==')
@settings(deadline=None)
@given(full_script())
def test_delta_sync(all_scripts):
    since_is_rowid = False
    # since_is_rowid = data.draw(booleans())
    # todo: expand this test to do many tables. since_is_rowid works after our rowid reversion only because there's a single table.

    def open_db(i):
        conn = connect(":memory:")
        conn.execute(
            "CREATE TABLE item (id PRIMARY KEY, width INTEGER, height INTEGER, name TEXT, description TEXT, weight INTEGER)")
        conn.execute("SELECT crsql_as_crr('item')")
        conn.commit()
        return (i, conn, dict())

    (num_dbs, scripts, total_steps) = all_scripts
    dbs = list(map(open_db, range(num_dbs)))

    for step_index in range(total_steps):
        for db, script in zip(dbs, scripts):
            if step_index >= len(script):
                continue
            maybe_num_peers_to_sync = run_step(db, script[step_index])
            if maybe_num_peers_to_sync is not None:
                sync_from_random_peers(
                    maybe_num_peers_to_sync, db, dbs, since_is_rowid)

    sync_all(dbs, since_is_rowid)

    for i in range(0, len(dbs) - 1):
        conn1 = dbs[i][1]
        conn2 = dbs[i+1][1]

        left_rows = conn1.execute(
            "SELECT * FROM item ORDER BY id ASC").fetchall()
        right_rows = conn2.execute(
            "SELECT * FROM item ORDER BY id ASC").fetchall()

        assert (left_rows == right_rows)
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
        return step[3]
    elif op == UPDATE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY id LIMIT 1;").fetchone()
        if row is None:
            return

        column_data = step[1]

        (column_names, column_values) = get_column_names_values(column_data)
        set_statements = ["{} = ?".format(x) for x in column_names]

        conn.execute("UPDATE item SET {} WHERE id = ?".format(
            ", ".join(set_statements)), tuple([row[0]] + column_values))
        conn.commit()
        return step[2]
    elif op == DELETE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY id LIMIT 1;").fetchone()
        if row is None:
            return

        conn.execute("DELETE FROM item WHERE id = ?", row)
        conn.commit()
        return step[1]


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


def sync_from_random_peers(num_peers_to_sync, db, dbs, since_is_rowid):
    peer_tracker = db[2]
    conn = db[1]
    dbid = db[0]

    dbids = list(range(len(dbs)))
    # don't sync with self
    dbids.remove(dbid)

    # pull 1-n other dbids to pull from
    pull_from_dbids = random.choices(
        dbids, k=num_peers_to_sync)

    for pull_from in pull_from_dbids:
        since = peer_tracker.get(pull_from, 0)
        new_since = sync_left_to_right(
            dbs[pull_from][1], conn, since, since_is_rowid)
        peer_tracker[pull_from] = new_since


def sync_left_to_right(l, r, since, since_is_rowid):
    if since_is_rowid:
        changes = l.execute(
            "SELECT *, rowid FROM crsql_changes WHERE rowid > ? ORDER BY db_version, seq ASC", (since,))
    else:
        changes = l.execute(
            "SELECT * FROM crsql_changes WHERE db_version > ? ORDER BY db_version, seq ASC", (since,))

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
#  ('94daba98-68ae-9069-2e79-14ecda1ceeff', None, -248, '', 'F(', 60177) != ('94daba98-68ae-9069-2e79-14ecda1ceeff', None, -248, '', 'F(\x00¤§ÀÝ\U000676dd\U00102cc03', 60177)
#
