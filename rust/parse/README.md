# cfsqlite-parse

Processes conflict-free SQL statements of the form:

```
CREATE CRR TABLE ...
CREATE CRR [UNIQUE] INDEX ...
ALTER CRR TABLE ...
```

where crr means "conflict free replicated relation."

If the provided statement is not a `CRR` statement it is ignored and a `None` result is returned.

If the provided statement is a `CRR` statement, an AST representation of the underlying `SQL` statement (the CRR statement sans the CRR keyword) is returned.

This AST can be used by other crates to re-write the desired create/alter statement into its conflict free variant(s) and then re-issue those statements against a sqlite db.
