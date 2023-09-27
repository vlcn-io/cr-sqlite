# Test key creation:

# - Stable rowid in all circumstances (re-insert, update, insert, delete, insert or ignore/replace/onconflict)
# - Always exists after each op
# - Created for mergers of new rows
# - Not created for merges of existing rows
# - Not created or deleted for merges of existing rows that are deleteed
# - Created for mergers of deletions for unseen rows

from crsql_correctness import connect, close, min_db_v
from pprint import pprint


def test_insert():
    None


def test_insert_or_replace():
    None


def test_inser_or_ignore():
    None


def test_insert_on_conflict_update():
    None


def test_update():
    None


def test_delete():
    None


def test_delete_all():
    None


def test_merge_new_row():
    None


def test_merge_existing_row():
    None


def test_merge_delete_new_row():
    None


def test_merge_delete_existing_row():
    None


def test_merge_update_existing_row():
    None
