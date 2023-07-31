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


# The idea here is that we are using an upsert to create a row that has never existing in our db
# In metadata tables or otherwise
def test_upsert_non_existing():
    None


# Here we are upserting a row that previously existed and has metadata entries but no entries
# in the base tables.
def test_upsert_previously_existing():
    None


# Here we are upserting in order to update a row that exists in metadata and base tables.
def test_upsert_currently_existing():
    None


# Run of the mill update against a row that exists
def test_update_existing():
    None


# Run of the mill insert but the row we are trying to insert exists
def test_insert_existing():
    None


# Shoudl be a no-op
def test_insert_or_ignore_existing():
    None


# Run of the mill delete
def test_delete_existing():
    None


# Try deleting something we already deleted. Should be no-op.
def test_delete_previously_deleted():
    None


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
