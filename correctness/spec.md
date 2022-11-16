# Correctness

## DB Version

1. [x] Min int on first db creation
2. [x] Increments with every modification to a crr datum
3. [x] Restored from disk on db load
4. [x] Unique for each transaction

## Site id

1. [x] Initialized to a uuid at startup
2. [x] Persisted
3. [x] Loaded from disk if exists on disk
4. [x] Does not ever change after being set, even between restarts

## Schema modification

1. [ ] create table
   1. [ ] if not exists support
   2. [ ] temp table support
   3. [x] quoted identifiers
   4. [x] no primary keys table
   5. [x] compound primary key table
   6. [x] single primary key
2. [ ] create index
   1. [ ] create unique index not allowed
3. [ ] drop index
4. [ ] drop table
5. [ ] alter table
6. [ ] table constraints
   1. [ ] fk constraints not allowed
7. [ ] `crr_from` is idempotent

## Inserts of new rows

1. [x] version cols start at 0
2. [x] cl starts at 1
3. [x] db version incremented
4. [x] clock record written with new db version and current site id for current row
5. [ ] ~~db version is not in use on any other row~~
6. [x] cols have the inserted values
7. [x] update src is 0

## Updates of rows

1. [ ] version cols for changed rows increment by 1
2. [ ] version cols for unchanges rows do not change
3. [ ] db version is incremented
4. [ ] clock record for this row records new db version that is greater than last recorded db version
5. [ ] db version for the row is globally unique
6. [ ] local updates are always taken -- no conflict resolution required
7. [ ] update src is 0

## Deletes of rows

1. [ ] db version is incremented
2. [ ] clock record for this row records new db version that is greater than last recorded db version
3. [ ] db version for the row is globally unique
4. [ ] local deletes are always taken -- no conflict resolution required
5. [ ] if causal length was odd, it is incremented
6. [ ] if causal length was even, it is unchanged
7. [ ] version columns are unchanged
8. [ ] value columns are unchanged
9. [ ] update src is 0

## Inserts of existing rows

1. [ ] if causal length was odd, it is unchanged
2. [ ] if causal length was even, it is incremented
3. [ ] only cols referenced in insert are changed
4. [ ] version cols are incremented for changed cols
5. [ ] version cols are unchanged for unchanged cols
6. [ ] clock record for this row records new db version that is greater than last recorded db version
7. [ ] db version for the row is globally unique
8. [ ] update src is 0

## Reads

1. [ ] deleted rows (even cl) are not returned
2. [ ] undeleted (odd cl) rows are returned
3. [ ] version cols are not returned
4. [ ] cl is not returned
5. [ ] update src is note returned

## Merging remote changes

1. [ ] merges against a row are idempotent
    1. [ ] merging an old row (by vclock) does not change the new row
    2. [ ] merging a row with an identical copy of itself does not change the row
    3. [ ] reapplications of a merge, after the first, does not impact the state of the row
2. [ ] update src is set to 1
3. [ ] only columns with higher versions are taken
4. [ ] if versions match for a column, the greater value is taken
5. [ ] physical deletion is final

## Sync Bit
1. [ ] no replication on changes from sync

## Computing deltas against remote clock

## Concurrency


## Primary key only tables
