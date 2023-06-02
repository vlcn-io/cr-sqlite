from crsql_correctness import connect, close
from hypothesis import given
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids
from functools import reduce
import pprint

INSERT = 0
UPDATE = 1
DELETE = 2

# CREATE TABLE item (id, width, height, name, description, weight)
COLUMN_TYPES = (
    integers,
    integers,
    text,
    text,
    floats
)

COLUMN_NAMES = (
    "width",
    "height",
    "name",
    "dscription"
)


@given(data())
def test_delta_sync(data):
    def create_column_data(which_columns):
        return tuple(None if c == False else COLUMN_TYPES[i](
        ) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = data.draw(integers(0, 2))
        which_columns = (data.draw(booleans()), data.draw(booleans()), data.draw(
            booleans()), data.draw(booleans()), data.draw(booleans()))

        if op == INSERT:
            return (op, uuids(), create_column_data(which_columns))

        if op == UPDATE:
            # force on column to true
            return (op, create_column_data(which_columns))

        return (op)

    def make_script(x):
        length = data.draw(integers(0, 100))
        return list(map(gen_script_step, range(length)))

    def open_db(i):
        conn = connect(":memory:")
        conn.execute(
            "CREATE TABLE item (id PRIMARY KEY, width, height, name, description, weight)")
        conn.execute("SELECT crsql_as_crr('item')")
        conn.commit()
        return (i, conn, dict())

    num_dbs = data.draw(integers(2, 5))
    dbs = list(map(open_db, range(num_dbs)))
    scripts = list(map(make_script, range(num_dbs)))

    total_steps = reduce(lambda l, r: l + len(r), scripts, 0)
    sync_chance = data.draw(integers(0, 9))

    for step_index in range(total_steps):
        for db, script in zip(dbs, scripts):
            if step_index >= len(script):
                continue
            run_step(db, script[step_index])
            if data.draw(integers(0, sync_chance)) == 0:
                sync_to_random_peers(db, dbs)

    sync_all(dbs)

    for db in dbs:
        close(db[1])


def run_step(db, step):
    op = step[0]
    conn = db[1]

    def get_column_names_values(column_data):
        column_values = [x for x in column_data if x is not None]
        column_names = [x for x in list(
            None if column_data[i] == None else name for i, name in enumerate(COLUMN_NAMES)) if x is not None]
        return (column_names, column_values)

    if op == INSERT:
        id = step[1]
        column_data = step[2]

        (column_names, column_values) = get_column_names_values(column_data)
        column_placeholders = ["?" for x in column_values]

        sql = "INSERT INTO item ({}) VALUES ({})".format(
            ", ".join(["id"] + column_names), ", ".join(["id"] + column_placeholders))
        pprint.pprint(sql)
        conn.execute(sql, tuple([id] + column_values))
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


def sync_all(dbs):
    None


def sync_to_random_peers(db, dbs):
    None


def sync_left_to_right():
    None

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
