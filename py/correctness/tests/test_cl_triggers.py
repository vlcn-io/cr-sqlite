# We need to test all the various cases to ensure:

# Deletes result in even CL
# Inserts result in odd CL
# Updates do not change CL
# edge cases:

# upserts to update existing rows in base tables
# modifying primary key columns to cause deletes and creations of new rows in an update
# trying to delete the same row again?
# trying to insert the same row again?
# updates to existing row(s)

# Repeat tests for merge conditions

from crsql_correctness import connect, close, min_db_v
from pprint import pprint
import pytest


# The idea here is that we are using an upsert to create a row that has never existing in our db
# In metadata tables or otherwise
def test_upsert_non_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL NOT NULL, b TEXT) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    # test both methods of upsert
    c.execute("INSERT OR REPLACE INTO foo VALUES (1, '2')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (2, '3') ON CONFLICT DO UPDATE set b = '4'")
    c.commit()
    changes = c.execute(
        "SELECT pk, cl FROM crsql_changes").fetchall()

    # Causal lengths should be 1 for both
    assert (changes == [(b'\x01\t\x01', 1),
                        (b'\x01\t\x02', 1)])


def test_insert_delete_insert_delete():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # Continuously counted up
    assert (changes == [(b'\x01\t\x01', '-1', 4)])


# Here we are upserting a row that previously existed and has metadata entries but no entries
# in the base tables.
def test_upsert_previously_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()
    c.execute("DELETE FROM foo")
    c.commit()

    c.execute(
        "INSERT INTO foo VALUES (1, 4) ON CONFLICT DO UPDATE set b = b")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # thing went from live (1) -> dead (2) -> live (3)
    assert (changes == [(b'\x01\t\x01', '-1', 3)])

    c.execute("INSERT INTO foo VALUES (2, 2)")
    c.execute("DELETE FROM foo")
    c.execute("INSERT OR REPLACE INTO foo VALUES (2, 4)")
    c.commit()
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # thing went from live (1) -> dead (2) -> live (3)
    # even though it is a re-insertion we wouldn't double count
    # we have a delete record for the prior test in this test case (4)
    assert (changes == [(b'\x01\t\x01', '-1', 4), (b'\x01\t\x02', '-1', 3)])


# Here we are upserting in order to update a row that exists in metadata and base tables.
def test_upsert_currently_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()
    # A replace acts as an insert.
    # A `do update` acts as an update.
    # So we test both ways of upserting.
    c.execute("INSERT OR REPLACE INTO foo VALUES (1, 3)")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    # Causal length bumps up to the next odd number given we are requesting to re-insert an existing row.
    # Nope ^^ -- we're keeping it stable given the optimization to infer causal length records.
    assert (changes == [(b'\x01\t\x01', 'b', 1)])

    c.execute(
        "INSERT INTO foo VALUES (1, 4) ON CONFLICT DO UPDATE set b = b")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    # Causal length remains stable given we asked to update, rather than re-insert, on conflict
    assert (changes == [(b'\x01\t\x01', 'b', 1)])


# Run of the mill update against a row that exists
def test_update_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()

    c.execute("UPDATE foo SET b = 3 WHERE a = 1")
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    assert (changes == [(b'\x01\t\x01', 'b', 1)])
    c.commit()

    c.execute("UPDATE foo SET b = 3 WHERE a = 3")
    c.commit()
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    assert (changes == [(b'\x01\t\x01', 'b', 1)])


# Run of the mill insert but the row we are trying to insert exists
# Not doing an upsert here. That is covered by upsert test cases.
def test_insert_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()

    with pytest.raises(Exception):
        c.execute("INSERT INTO foo VALUES (1, 2)")
        c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    # attempt to over-write the existing row raises an error and changes nothing
    assert (changes == [(b'\x01\t\x01', 'b', 1)])


# Shoudl be a no-op
def test_insert_or_ignore_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()

    c.execute("INSERT OR IGNORE INTO foo VALUES (1, 3)")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    # insert or ignore bumps no metadata
    assert (changes == [(b'\x01\t\x01', 'b', 1)])


# Run of the mill delete
def test_delete_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    c.commit()
    # Delete properly bumps the CL
    assert (changes == [(b'\x01\t\x01', '-1', 2)])


# Try deleting something we already deleted. Should be no-op given the row isn't there to indicate a need to bump metadata
def test_delete_previously_deleted():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.commit()
    c.execute("DELETE FROM foo")
    c.commit()
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # delete record stays at a causal length of 2
    assert (changes == [(b'\x01\t\x01', '-1', 2)])


# Changing a primary key should record a delete for the thing.
# What if the thing already has a delete entry? This is possible via merge.
# Changing primary key should record a create of the new thing. What if the new thing already exists and we do this
# via update on conflict...
# update on conflict replace a thing?
# What if a merge had ported some data in?


# Like a blank slate. The thing we change to never existed.
# Test this with:
# - compound
# - single
# - pko
def test_change_primary_key_to_something_new():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("UPDATE foo SET a = 2 WHERE a = 1")

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # pk 1 was deleted so has a CL of 2
    # pk 2 was created so has a CL of 1
    assert (changes == [(b'\x01\t\x02', '-1', 1), (b'\x01\t\x01', '-1', 2)])


# Previously existing thing should get bumped to re-existing
# Previously existing means we have metadata for the row but it is not a live row in the base tables.
def test_change_primary_key_to_previously_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO foo VALUES (2, 3)")
    c.commit()
    c.execute("DELETE FROM foo WHERE a = 2")
    c.execute("UPDATE foo SET a = 2 WHERE a = 1")

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # pk 1 was deleted so has a CL of 2
    # pk 2 was resurrected so has a CL of 3
    assert (changes == [(b'\x01\t\x02', '-1', 3), (b'\x01\t\x01', '-1', 2)])

    #  try changing to and away from 1 again to ensure we aren't stuck at 2


# Changing to something currently existing is an update that replaces the thing on conflict
def test_change_primary_key_to_currently_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("INSERT INTO foo VALUES (2, 3)")
    c.commit()
    c.execute("UPDATE OR REPLACE foo SET a = 2 WHERE a = 1")
    c.commit()

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes").fetchall()
    # pk 2 is alive as we `update or replaced` to it
    # and it is alive at version 3 given it is a re-insertion of the currently existing row
    # pk 1 is dead (cl of 2) given we mutated / updated away from it. E.g.,
    # set a = 2 where a = 1
    assert (changes == [(b'\x01\t\x02', 'b', 1),
            (b'\x01\t\x02', '-1', 1), (b'\x01\t\x01', '-1', 2)])


def test_change_primary_key_away_from_thing_with_large_length():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.commit()

    c.execute("UPDATE foo SET a = 2 WHERE a = 1")
    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()
    # first time existing for 2
    # third deletion for 1
    assert (changes == [(b'\x01\t\x02', '-1', 1), (b'\x01\t\x01', '-1', 6)])


# Test inserting something for which we have delete records for but no actual row
def test_insert_previously_existing():
    c = connect(":memory:")
    c.execute("CREATE TABLE foo (a INTEGER PRIMARY KEY NOT NULL, b INTEGER) STRICT;")
    c.execute("SELECT crsql_as_crr('foo')")
    c.commit()

    c.execute("INSERT INTO foo VALUES (1, 2)")
    c.execute("DELETE FROM foo")
    c.execute("INSERT INTO foo VALUES (1, 2)")

    changes = c.execute(
        "SELECT pk, cid, cl FROM crsql_changes WHERE cid = '-1'").fetchall()

    assert (changes == [(b'\x01\t\x01', '-1', 3)])


# Use hypothesis to generate a random sequence of events against a row?
# - insert
# - update
# - delete
# - upsert
# - insert or ignore
# - insert or replace
# - insert on conflcit do update
# - ?
# Available operations in the script depend on prior operations
# Or we're truly random and just handle exceptions to keep going since deleting a row that does not exist would throw
# or inserting a row that exists would throw.
def test_sequence():
    None
