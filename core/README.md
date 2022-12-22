# crsql/core

The core `SQLite` extension which adds CRDT/CRR support.

# Usage

`crsqlite` exposes three APIs:

- A function extension (`crsql_as_crr`) to upgrade existing tables to "crrs" or "conflict free replicated relations"
  - `SELECT crsql_as_crr('table_name')`
- A virtual table (`crsql_changes`) to ask the database for changesets or to apply changesets from another database
  - `SELECT * FROM crsql_changes WHERE version > x AND site_id != my_site`
  - `INSERT INTO crsql_changes VALUES ([patches receied from select on another peer])`
- And (on latest) `crsql_alter_begin('table_name')` & `crsql_alter_commit('table_name')` primitives to allow altering table definitions that have been upgraded to `crr`s.
  - Until we move forward with extending the syntax of SQLite to be CRR aware, altering CRRs looks like:
    ```sql
    SELECT crsql_alter_begin('table_name');
    -- 1 or more alterations to `table_name`
    ALTER TABLE table_name ...;
    SELECT crsql_alter_commit('table_name');
    ```
    A future version of cr-sqlite may extend the SQL syntax to make this more natural.

Application code would use the function extension to enable crr support on tables.
Networking code would use the `crsql_changes` virtual table to fetch and apply changes.

Usage looks like:

```sql
-- load the extension if it is not statically linked
.load crsqlite
.mode column
-- create tables as normal
create table foo (a primary key, b);
create table baz (a primary key, b, c, d);

-- update those tables to be crrs / crdts
select crsql_as_crr('foo');
select crsql_as_crr('baz');

-- insert some data / interact with tables as normal
insert into foo (a,b) values (1,2);
insert into baz (a,b,c,d) values ('a', 'woo', 'doo', 'daa');

-- ask for a record of what has changed
select * from crsql_changes;

table  pk   cid  val    col_version  db_version  site_id
-----  ---  ---  -----  -----------  ----------  -------
foo    1    b    2      1            1           1(�zL
                                                 \hx

baz    'a'  b    'woo'  1            2           1(�zL
                                                 \hx

baz    'a'  c    'doo'  1            2           1(�zL
                                                 \hx

baz    'a'  d    'daa'  1            2           1(�zL
                                                 \hx

-- merge changes from a peer
insert into crsql_changes
  ("table", pk, cid, val, col_version, db_version, site_id)
  values
  ('foo', 5, 'b', '''thing''', 5, 5, X'7096E2D505314699A59C95FABA14ABB5');
insert into crsql_changes ("table", pk, cid, val, col_version, db_version, site_id)
  values
  ('baz', '''a''', 'b', 123, 101, 233, X'7096E2D505314699A59C95FABA14ABB5');

-- check that peer's changes were applied
select * from foo;
a  b
-  -----
1  2
5  thing

select * from baz;
a  b    c    d
-  ---  ---  ---
a  123  doo  daa

-- tear down the extension before closing the connection
-- https://sqlite.org/forum/forumpost/c94f943821
select crsql_finalize();
```
