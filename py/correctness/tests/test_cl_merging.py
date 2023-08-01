from crsql_correctness import connect, close, min_db_v
from pprint import pprint
import pytest

# - larger cl wins
# - delete is deleted
# - resurrect is resurrected
# - same cl means col versions used
# - cl not moved forward unless there is a delta on merge
# - out of order for cl move up. non sentinel can resurrect or delete
# - app with undo?
# - update prop test to:
#   - prop test with pko table
#   - prop test with many tables
#   - prop test with out-of-order sync


def make_simple_schema():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()
    return c


def sync_left_to_right(l, r, since):
    changes = l.execute(
        "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


def test_larger_cl_wins_all():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("UPDATE foo SET b = 3 WHERE a = 1")
    c2.execute("UPDATE foo SET b = 4 WHERE a = 1")
    c2.commit()

    # c2 has larger col versions for b (two updates) and larger values
    # but has smaller causal length

    # check assumed invariants
    # c1 had a delete and resurrect so cl is 3
    # and given metadata is cleared on delete, b is col_version 1
    assert (c1.execute(
        "SELECT col_version, cl FROM crsql_changes WHERE cid = 'b'").fetchone() == (1, 3))

    # c2 hard col_version = 3 given insert + 2 updates
    # an cl = 1 given a single isnert
    assert (c2.execute(
        "SELECT col_version, cl FROM crsql_changes WHERE cid = 'b'").fetchone() == (3, 1))

    sync_left_to_right(c1, c2, 0)

    # causal length moved forward so the winner column clock should be set to the
    # insert column clock which is 1
    assert (c2.execute(
        "SELECT col_version, cl FROM crsql_changes WHERE cid = 'b'").fetchone() == (1, 3))

    values = c2.execute("SELECT * FROM foo").fetchall()
    # values in c2 are as expected -- the values from c1 since c1 has a later causal length
    assert (values == [(1, 1)])


def test_larger_cl_delete_deletes_all():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("UPDATE foo SET b = 3 WHERE a = 1")
    c2.execute("UPDATE foo SET b = 4 WHERE a = 1")
    c2.commit()

    sync_left_to_right(c1, c2, 0)

    rows = c2.execute("SELECT * FROM foo").fetchall()
    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    c1_changes = c1.execute("SELECT * FROM crsql_changes").fetchall()

    # We should have deleted the entry via sync of greater delete causal length from c1 to c2
    assert (rows == [])
    # this is wrong.. should not the `b` records be missing? Given delete should remove those metadata rows...
    # assert (changes == [('foo', b'\x01\t\x01', 'b', None, 3, 1, None, 2),
    #                     ('foo', b'\x01\t\x01', '-1', None, 2, 2, None, 2)])

    pprint(c1_changes)


def test_smaller_delete_does_not_delete():
    None


def test_pr_299_scenario():
    # https://github.com/vlcn-io/cr-sqlite/pull/299#issuecomment-1660570099
    None


def test_resurrection_via_sentinel():
    # col clocks get zeroed
    None


def test_resurrection_via_non_sentinel():
    # col clocks get zeroed
    None


def test_delete_via_sentinel():
    None


def test_delete_via_non_sentinel():
    None


def test_strut_edits_out_of_order_merge():
    None


def test_strut_edits_in_order_merge():
    None


def test_larger_col_version_same_cl():
    None


# TODO: should we instead merge w/ site_id so we don't need a value lookup?
def test_larger_col_value_same_cl_and_col_version():
    None


def test_pko_create():
    None


def test_pko_delete():
    None


def test_pko_resurrect():
    None


def test_cl_does_not_move_forward_when_equal():
    None


# create a bunch of changes and merge them in random orders as driven by hypothesis.
# end results should always be the same.
def test_out_of_order_merge():
    None


# can we check merge of delete with equal CL is a no-op?
