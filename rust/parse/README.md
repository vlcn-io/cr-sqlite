# cfsql - rust - parse

`cfsql` wraps sqlite connections and enables some new query syntax for `create` and `alter` table statements. The parser lets us replace `create` and `alter` table statements with the set of `SQL` statements required to make a conflict-free table or keep a table conflict-free post alteration.
