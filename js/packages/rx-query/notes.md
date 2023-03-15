```sql
SELECT contact.name, profilepic.uri FROM contacts JOIN profilepics ON contacts.profilepic_id = profilepics.id
```

```sql
INSERT INTO profilepic (id, uri);
```

Need a relation cache? And projections that are tied to those relations?

Relation cache is sparse based on what cols are selected, but PK is always selected.

So we must augment / re-write our queries to always grab PKs.

We can make `rxdb` completely sync in that it only returns subscriptions?

So all selects get re-written.

relation -> projection -> query
........\-> projection -> query

When an insert/update/delete happens, we check our relation cache.
If it exists in there, someone selected it previously.

We can walk from relation -> projection -> queries to find out who.

We can then re-run those queries against our in-memory cache of relations.

What if we "joined through" something?

If a row from a relation no longer matches any queries, it is dropped.

This solves updates and deletes. But does not solve inserts.

Inserts....
This is back to the query mapping semantics. But now we can do joins since we can pick
rows from our relation tables.

We'll use `rowid` magic to pull together all `rowids` needed for all the joins?
Unless of course we join _through_ something? Or can we pick those out too?

a -> b -> c

Yes. Just select `b.rowid`

May need to alias.

---

UPDATE w/ WHERE -- constrains range against a table
INSERT -- constrains range against table
DELETE

range on different columns.

Unconstrained query.
Single constraint.
Many constraint.

Many constraints -- must check that all overlap with insert
to include in range.

update -- for queries it not associated with, check if overlap
is dropped.

for queries it is associated with, check if overlap is created.

could be a range update tho.

delete -- drop from queries is associated with.

could be a range delete tho.

Start with:

- point updates, inserts, deletes

## Range updates & deletes:

range update targets a table
update constraints must all overlap select constraints.

SELECT * FROM u WHERE name > x and phone = y;

UPDATE u SET name = y WHERE phone = z;
^- this could set rows that were not previously selected (not cached) but
would become selected

>> It is safe to update the cached values and read directly from cache if
a query covers the update. << b/c then all the relevant rows would be in cache

Do you then re-run the query against the cache?

Unspecified constraints are unconstrained.
That update would match for the select.

ORs? Well this just creates two queries. Basically _union_ and we
check if either matches.

Constraint on sub-select?


---

no indexing, just running on row --

For a join, cache the "joined relation" ?

When find matching query --
(matched old row, but not new row)
(matches new row)

return op to either:
- update cache directly
- re-run query

---

relation -> projection -> query

join queries make a new relation which
also has a projection itself.

single row targeting mutations:
If query hits on insert, add to query cache for that query.
If query hits on update, add/update query cache for that query.
If did hit on delete, remove from query cache for that query.

Inserts will need to try to hydrate against the join relation.
They can try to join against all things inserted in that tx.

- So we add the rows to the base cached relations
- Then we go to the join relations and try to construct the rows
there.
- Then we go to queries we have against those relations and run them
against the newly inserted row to check for a match.
 ^-- which queries can we not run in-mem? No sub-selects.


many row targeting mutations:
if there is any overlap between the constraints of the mutation
and contraints of the query, re-run the query.

e.g.,
`delete from components where slide_id = x`

would not match any selects of components where `slide_id != x` given
there is no overlap of constraints. The delete (or update) is
targeting different rows.

if a constrained column is being modified, re-run the query.

---

Re-writing selects...
- Pull rowids
- if joins, pull all rowids & make a new relation in cache if one does not exist

---

aggregations -- revert the old row value, apply the new row value.

---

Map your SQL to simpler graph expressions?


---

Range table indexing of queries?

someone issues a query, we pull constraints and create
a range in the range tree for each constraint against an indexed
column...

