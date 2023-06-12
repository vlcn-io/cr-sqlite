# 1. increments by one for each op in a tx
# 2. resets to 0 on every tx
# 3. does not roll backwards
# 4. correctly preserved in concurrent transactions?
from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def test_increments_by_one():
    c = connect(":memory:")
    c.execute("create table foo (id primary key, a)")
    c.execute("select crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo (1, 2)")
    c.commit()

    rows = c.execute("SELECT * FROM foo__crsql_clock").fetchall()
    pprint(rows)
