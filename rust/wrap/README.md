# cfsql - rust - embed

Users will get a normal connection to `sqlite` in their target language and then pass this connection to `cfsql`. `cfsql` will augment the connection with the required extensions to allow it to be conflict free.

Either the raw connection can be used post-augmentation or the `cfsql` wrapped connection can be used. It is recommended to use the wrapped connection if you will issue any `create table` or `alter table` statements.
`cfsql` re-writes `alter table` and `create table` statements in order to preserve the conflict resolution properties of the table.

All other statements are simply passed through to the underlying connection.