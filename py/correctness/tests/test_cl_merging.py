from crsql_correctness import connect, close, min_db_v
from pprint import pprint
import random
import pytest
from hypothesis import given, settings, example, HealthCheck
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids, characters, composite
from functools import reduce
import uuid

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


def make_pko_schema():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY) STRICT;")
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


def sync_left_to_right_include_siteid(l, r, since):
    changes = l.execute(
        "SELECT [table], pk, cid, val, col_version, db_version, coalesce(site_id, crsql_site_id()), cl FROM crsql_changes WHERE db_version > ?", (since,))
    for change in changes:
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()


# How a sync should be implemented in a situation with:
# - in order deliver
# - delta state sync
def sync_left_to_right_normal_delta_state(l, r, since):
    r_siteid = r.execute("SELECT crsql_site_id()").fetchone()[0]
    changes = l.execute(
        "SELECT [table], pk, cid, val, col_version, db_version, coalesce(site_id, crsql_site_id()), cl FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?",
        (since, r_siteid))
    largest_version = 0
    for change in changes:
        max(largest_version, change[5])
        r.execute(
            "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", change)
    r.commit()
    return largest_version


def sync_left_to_right_single_vrsn(l, r, vrsn):
    r_siteid = r.execute("SELECT crsql_site_id()").fetchone()[0]
    changes = l.execute(
        "SELECT [table], pk, cid, val, col_version, db_version, coalesce(site_id, crsql_site_id()), cl FROM crsql_changes WHERE db_version = ? AND site_id IS NOT ?",
        (vrsn, r_siteid))
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
    close(c1)
    close(c2)


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
    c2_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    c1_changes = c1.execute("SELECT * FROM crsql_changes").fetchall()

    # We should have deleted the entry via sync of greater delete causal length from c1 to c2
    assert (rows == [])

    # c1 shouldn't have column metadata but only a delete record of the dropped item whose causal length should be 2.
    assert (c1_changes == [('foo', b'\x01\t\x01', '-1', None, 2, 1, None, 2)])
    # c2 merged in the delete thus bumping causal length to 2 and bumping db version since there was a change.
    assert (c2_changes == [('foo', b'\x01\t\x01', '-1', None, 2, 2, None, 2)])
    close(c1)
    close(c2)


def test_smaller_delete_does_not_delete_larger_cl():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("DELETE FROM foo")
    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    # check the pre-condition the c1 actually has a delete event
    c1_changes = c1.execute("SELECT * FROM crsql_changes").fetchall()
    assert (c1_changes == [('foo', b'\x01\t\x01', '-1', None, 2, 1, None, 2)])

    c2_changes_pre_merge = c2.execute("SELECT * FROM crsql_changes").fetchall()

    sync_left_to_right(c1, c2, 0)

    c2_changes_post_merge = c2.execute(
        "SELECT * FROM crsql_changes").fetchall()

    # the merge should be a no-op since c1 can't impact c2 due to having a lesser causal length
    # this the changesets should not change
    assert (c2_changes_pre_merge == c2_changes_post_merge)
    close(c1)
    close(c2)


def test_equivalent_delete_cls_is_noop():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("DELETE FROM foo")
    c2.commit()

    # create a manual clock entry that wouldn't normally exist
    # this clock entry would be removed if the merge does any work rather than bailing early
    c2.execute(
        "INSERT INTO foo__crsql_clock VALUES (1, 'b', 3, 1, NULL, 1)")
    c2.commit()
    pre_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    sync_left_to_right(c1, c2, 0)
    post_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (pre_changes == post_changes)
    close(c1)
    close(c2)


def test_smaller_cl_loses_all():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("UPDATE foo SET b = 123 WHERE a = 1")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("DELETE FROM foo")
    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    pre_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    sync_left_to_right(c1, c2, 0)
    post_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()

    # the merge should be a no-op since c1 has a lower causal length.
    assert (pre_changes == post_changes)
    close(c1)
    close(c2)


def test_pr_299_scenario():
    # https://github.com/vlcn-io/cr-sqlite/pull/299#issuecomment-1660570099
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    # c1 version 1 -- initial create
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    # c2 version 1 -- initial create and high clock values
    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("UPDATE foo SET b = 2 WHERE a = 1")
    c2.execute("UPDATE foo SET b = 3 WHERE a = 1")
    c2.execute("UPDATE foo SET b = 4 WHERE a = 1")
    c2.commit()

    # c1 version 2 -- delete
    c1.execute("DELETE FROM foo")
    c1.commit()

    # c1 version 3 -- resurrect
    c1.execute("INSERT INTO foo VALUES (1, 1)")

    # send resurrect to c2, skip over earlier events and delete event
    sync_left_to_right(c1, c2, 2)

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()

    # c2 should have accepted all the changes given the higher causal length
    # a = 1, b = 1, cl = 3
    # note: why is site_id missing??? Ah, it is missing since we don't coalesce to get it. This is expected.
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 3, None, 3),
                        ('foo', b'\x01\t\x01', 'b', 1, 1, 3, None, 3)])
    # c2 and c1 should match in terms of data
    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())
    # syncing the rest of c1 to c2 is a no-op
    sync_left_to_right(c1, c2, 0)
    post_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == post_changes)
    close(c1)
    close(c2)


def test_sync_with_siteid():
    # Delete
    # Resurrect
    # Create
    # Update
    # all these cases should carry over the siteid as expected
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    sync_left_to_right_include_siteid(c1, c2, 0)
    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    c1_site_id = c1.execute("SELECT crsql_site_id()").fetchone()[0]
    assert (changes == [('foo',
                         b'\x01\t\x01',
                         'b',
                         1,
                         1,
                         1,
                         c1_site_id,
                         1)])

    c1.execute("UPDATE foo SET b = 2 WHERE a = 1")
    c1.commit()
    sync_left_to_right_include_siteid(c1, c2, 1)
    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo',
                         b'\x01\t\x01',
                         'b',
                         2,
                         2,
                         2,
                         c1_site_id,
                         1)])

    c1.execute("DELETE FROM foo WHERE a = 1")
    c1.commit()
    sync_left_to_right_include_siteid(c1, c2, 2)
    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo',
                        b'\x01\t\x01',
                         '-1',
                         None,
                         2,
                         3,
                         c1_site_id,
                         2)])

    c1.execute("INSERT INTO foo VALUES (1, 5)")
    c1.commit()
    sync_left_to_right_include_siteid(c1, c2, 3)
    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo',
                        b'\x01\t\x01',
                         '-1',
                         None,
                         3,
                         4,
                         c1_site_id,
                         3),
                        ('foo',
                        b'\x01\t\x01',
                         'b',
                         5,
                         1,
                         4,
                         c1_site_id,
                         3)])
    close(c1)
    close(c2)


def test_resurrection_of_live_thing_via_sentinel():
    # col clocks get zeroed
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    # a resurrection of an already live row
    sentinel_resurrect = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid = '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sentinel_resurrect)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()

    # 'b' should be zeroed column version but latest db version.
    assert (changes == [('foo', b'\x01\t\x01', 'b', 1, 0, 2, None, 3),
                        ('foo', b'\x01\t\x01', '-1', None, 3, 2, None, 3)])
    # now lets finish getting changes from the other node
    changes = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid != '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", changes)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 2, None, 3),
                        # col version bump to 1 since the other guy won on col version.
                        # db version bumped as well since the col version changed.
                        # holding the db version stable would prevent nodes that proxy other nodes
                        # from forwarding their changes to those other nodes.
                        # E.g.,
                        # A -> B -> C
                        # B could send data to C and lose there.
                        # Then B receives changes from A which move B's clock forward w/o changing B's value
                        # C then merges to B and loses there
                        # If B db version didn't change then C would never get the changes that B is proxying from A
                        ('foo', b'\x01\t\x01', 'b', 1, 1, 3, None, 3)])
    close(c1)
    close(c2)


def test_resurrection_of_live_thing_via_non_sentinel():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    non_sentinel_resurrect = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid != '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", non_sentinel_resurrect)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    # we get the new values as expected
    # db version pushed
    # col version is at 1 given we rolled the causal length forward for the resurrection
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 2, None, 3),
                        ('foo', b'\x01\t\x01', 'b', 1, 1, 2, None, 3)])

    # sync all other entries should be a no-op
    sync_left_to_right(c1, c2, 0)
    post_changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == post_changes)
    close(c1)
    close(c2)


def test_resurrection_of_dead_thing_via_sentinel():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("DELETE FROM foo")
    c2.commit()

    sentinel_resurrect = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid = '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sentinel_resurrect)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    # row comes back
    # cl = 3 given resurrected from dead (2)
    # db_version = 2 given it was a change
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 2, None, 3)])
    close(c1)
    close(c2)


def test_resurrection_of_dead_thing_via_non_sentinel():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.execute("DELETE FROM foo")
    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.execute("DELETE FROM foo")
    c2.commit()

    sentinel_resurrect = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid != '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sentinel_resurrect)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    # row comes back
    # cl = 3 given resurrected from dead (2)
    # db_version = 2 given it was a change
    # col version rolled back given cl moved forward
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 2, None, 3),
                        ('foo', b'\x01\t\x01', 'b', 1, 1, 2, None, 3)])
    close(c1)
    close(c2)


def test_advance_db_version_on_clock_zero_scenario():
    # Not moving DB version can create a divergence in this scenario:
    # Four Peers: A, B, C, D
    # - C and D merge together and have same state
    # - D merges in B where B's values lose
    # - B receives a DELETE from A and zeros its clocks without moving db_version on those items
    # - C merges in B up to the same db_version that D did
    # - Remember C's state matched D's
    # - B's changes win on C (whereas they lost on D which was identical to C) because the causal length went forward
    # - C and D are diverged even though they believe themselves to have seen exactly the same events
    # - C and D get latest changes from B (the resurrect) and are still diverged even after seeing all events
    #   in the system.
    #
    # To remedy, the db_version must be moved forward on the rows that we zero the clocks.
    # This way D will receive the updated clocks from B when asking B for the latest changes
    # and D & C will converge after seeing all events from B.
    None


def test_delete_via_sentinel():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()
    c1.execute("DELETE FROM foo")
    c1.commit()

    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    sentinel_delete = c1.execute(
        "SELECT * FROM crsql_changes WHERE cid = '-1'").fetchone()
    c2.execute(
        "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sentinel_delete)
    c2.commit()

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 2, 2, None, 2)])
    close(c1)
    close(c2)


# this case doesn't exist. Delete drops all metadata but the sentinel
# def test_delete_via_non_sentinel():


# def test_strut_edits_out_of_order_merge():
#     c1 = make_simple_schema()
#     c2 = make_simple_schema()


#     close(c1)
#     close(c2)


# def test_strut_edits_in_order_merge():
#     None

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
def random_rows(draw):
    def create_column_data(which_columns):
        return tuple(None if c == False else draw(COLUMN_TYPES[i]) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = draw(integers(0, 2))
        which_columns = (draw(booleans()), draw(booleans()), draw(
            booleans()), draw(booleans()), draw(booleans()))

        if op == INSERT:
            return (op, str(uuid.uuid4()), create_column_data(which_columns))

        if op == UPDATE:
            # force at least one column to true
            if not any(which_columns):
                temp = list(which_columns)
                temp[0] = True
                which_columns = tuple(temp)
            return (op, create_column_data(which_columns))

        # DELETE
        return (op,)

    def make_script():
        length = draw(integers(0, 250))
        return list(map(gen_script_step, range(length)))

    return make_script()


def run_step(conn, step):
    op = step[0]

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
    elif op == DELETE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY id LIMIT 1;").fetchone()
        if row is None:
            return

        conn.execute("DELETE FROM item WHERE id = ?", row)
        conn.commit()


def create_hypothesis_schema(c):
    c.execute(
        "CREATE TABLE item (id PRIMARY KEY, width INTEGER, height INTEGER, name TEXT, description TEXT, weight INTEGER)")
    c.execute("SELECT crsql_as_crr('item')")


# Merge order should not matter. Once all events in the system
# have been seen, all nodes will converge.
# The test below syncs events from node A to node B in a random order.
@settings(deadline=None)
@given(random_rows(), integers())
def test_out_of_order_merge(script, seed):
    steps = script
    c1 = connect(":memory:")
    c2 = connect(":memory:")
    create_hypothesis_schema(c1)
    create_hypothesis_schema(c2)

    for step in steps:
        run_step(c1, step)

    sync_randomly(c1, c2, seed)

    # Now compare the two base tables to ensure they have identical content
    c1_content = c1.execute("SELECT * FROM item ORDER BY id ASC").fetchall()
    c2_content = c2.execute("SELECT * FROM item ORDER BY id ASC").fetchall()

    assert (c1_content == c2_content)


def sync_randomly(l, r, seed):
    num_transactions = l.execute(
        "SELECT max(db_version) from crsql_changes").fetchone()[0]
    if num_transactions is not None:
        # transactions are 1 indexed. 1 transaction should be range [1, 2)
        merge_order = list(range(1, num_transactions + 1))
        random.seed(seed)
        random.shuffle(merge_order)

        for vrsn in merge_order:
            sync_left_to_right_single_vrsn(l, r, vrsn)

# Create rows on both c1 and c2
# Merge both nodes together in a random order
# Check state at the end


@settings(deadline=None)
@given(random_rows(), random_rows(), integers())
def test_out_of_order_merge_bidi(c1_script, c2_script, seed):
    c1 = connect(":memory:")
    c2 = connect(":memory:")
    create_hypothesis_schema(c1)
    create_hypothesis_schema(c2)

    for step in c1_script:
        run_step(c1, step)
    for step in c2_script:
        run_step(c2, step)

    # c1 into c2
    sync_randomly(c1, c2, seed)
    # c2 into c1
    sync_randomly(c2, c1, seed)

    # now all the things should match
    c1_content = c1.execute("SELECT * FROM item ORDER BY id ASC").fetchall()
    c2_content = c2.execute("SELECT * FROM item ORDER BY id ASC").fetchall()

    assert (c1_content == c2_content)

    close(c1)
    close(c2)


# This is the case where a node stands between two other nodes
# and proxies all changes through.
# We should do `changes_since` style merging for this.
# A -> B -> C
# Merge
@settings(deadline=None)
@given(random_rows(), random_rows())
def test_ordered_delta_merge_proxy(a_script, c_script):
    # There are many edge cases that, if not handled properly, can lead to changes
    # not getting passed through the proxy when doing delta-state syncing.
    a = connect(":memory:")
    b = connect(":memory:")
    c = connect(":memory:")
    create_hypothesis_schema(a)
    create_hypothesis_schema(b)
    create_hypothesis_schema(c)

    b_last_saw_a = 0
    c_last_saw_b = 0
    b_last_saw_c = 0
    a_last_saw_b = 0
    longest_script = max(len(a_script), len(c_script))
    for i in range(0, longest_script):
        if i < len(a_script):
            step = a_script[i]
            run_step(a, step)
            # sync the step to b
            b_last_saw_a = sync_left_to_right_normal_delta_state(
                a, b, b_last_saw_a)
            # sync the step from b to c
            c_last_saw_b = sync_left_to_right_normal_delta_state(
                b, c, c_last_saw_b)

        if i < len(c_script):
            step = c_script[i]
            run_step(c, step)
            # sync the step to b
            b_last_saw_c = sync_left_to_right_normal_delta_state(
                c, b, b_last_saw_c)
            # sync the step from b to a
            a_last_saw_b = sync_left_to_right_normal_delta_state(
                b, a, a_last_saw_b)
    #

    # now all the things should match
    a_content = a.execute("SELECT * FROM item ORDER BY id ASC").fetchall()
    b_content = b.execute("SELECT * FROM item ORDER BY id ASC").fetchall()
    c_content = c.execute("SELECT * FROM item ORDER BY id ASC").fetchall()

    assert (a_content == c_content)
    assert (c_content == b_content)

    close(a)
    close(b)
    close(c)

# TODO: repeat above hypothesis tests with:
# 1. more tables
# 2. differing schemas (e.g., pk only tables, junction tables)


def test_larger_col_version_same_cl():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 1)")
    c1.commit()
    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    c1.execute("UPDATE foo SET b = 0 WHERE a = 1")
    c1.commit()

    sync_left_to_right(c1, c2, 0)

    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())

    close(c1)
    close(c2)


def test_larger_col_value_same_cl_and_col_version():
    c1 = make_simple_schema()
    c2 = make_simple_schema()

    c1.execute("INSERT INTO foo VALUES (1, 4)")
    c1.commit()
    c2.execute("INSERT INTO foo VALUES (1, 1)")
    c2.commit()

    sync_left_to_right(c1, c2, 0)

    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())

    close(c1)
    close(c2)


def test_pko_create():
    c1 = make_pko_schema()
    c2 = make_pko_schema()
    c1.execute("INSERT INTO foo VALUES (1)")
    c1.commit()

    sync_left_to_right(c1, c2, 0)

    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())

    close(c1)
    close(c2)


def test_pko_delete():
    c1 = make_pko_schema()
    c2 = make_pko_schema()
    c1.execute("INSERT INTO foo VALUES (1)")
    c1.commit()
    c2.execute("INSERT INTO foo VALUES (1)")
    c2.commit()
    c1.execute("DELETE FROM foo")
    c1.commit()

    sync_left_to_right(c1, c2, 0)

    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())

    close(c1)
    close(c2)


def test_pko_resurrect():
    c1 = make_pko_schema()
    c2 = make_pko_schema()
    c1.execute("INSERT INTO foo VALUES (1)")
    c1.commit()
    c2.execute("INSERT INTO foo VALUES (1)")
    c2.commit()
    c1.execute("DELETE FROM foo")
    c1.commit()
    c1.execute("INSERT INTO foo VALUES (1)")
    c1.commit()
    c2.execute("DELETE FROM foo")

    sync_left_to_right(c1, c2, 0)

    assert (c1.execute("SELECT * FROM foo").fetchall() ==
            c2.execute("SELECT * FROM foo").fetchall())

    changes = c2.execute("SELECT * FROM crsql_changes").fetchall()
    assert (changes == [('foo', b'\x01\t\x01', '-1', None, 3, 3, None, 3)])

    close(c1)
    close(c2)


def test_cl_does_not_move_forward_when_equal():
    None


# can we check merge of delete with equal CL is a no-op?
