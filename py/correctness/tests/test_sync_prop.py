from crsql_correctness import connect, close
from hypothesis import given
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids
from functools import reduce

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


@given(data())
def test_delta_via_dbversion(data):
    def create_column_data(which_columns):
        tuple(None if c == False else COLUMN_TYPES[i](
        ) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = data.draw(integers(0, 2))
        which_columns = (data.draw(booleans()), data.draw(booleans()), data.draw(
            booleans()), data.draw(booleans()), data.draw(booleans()))

        if op == INSERT:
            return (op, uuids(), create_column_data(which_columns))

        if op == UPDATE:
            return (op, create_column_data(which_columns))

        return (op)

    def make_script(x):
        length = data.draw(integers(0, 100))
        return list(map(gen_script_step, range(length)))

    num_dbs = data.draw(integers(2, 5))
    dbs = list(map(lambda c: connect(":memory:"), range(num_dbs)))
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

    do_full_sync(dbs)

    for db in dbs:
        close(db)


def run_step(db, step):
    None

# run up and back down


def do_full_sync(dbs):
    None


def sync_to_random_peers(db, dbs):
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
