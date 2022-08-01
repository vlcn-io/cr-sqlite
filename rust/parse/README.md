# cfsql - rust - parse

`cfsql` wraps sqlite connections and enables some new query syntax for `create` and `alter` table statements. The parser lets us replace `create` and `alter` table statements with the set of `SQL` statements required to make a conflict-free table or keep a table conflict-free post alteration.

Intercepted & re-written statements of https://sqlite.org/lang.html:
- create table
- alter table
- create index
- drop index
- drop table

