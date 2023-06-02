from crsql_correctness import connect, close
from hypothesis import given
from hypothesis.strategies import lists, integers


def test_delta_via_dbversion():
    None

# We want to:
# 1. spin up 10 databases
# 2. Have them randomly insert/update/delete items
# 3. Periodically sync between peers
# 4. Do a full sync amongs the entire set
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
