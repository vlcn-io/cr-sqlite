Outline:

- Keep track of databases to replicate
- Keep track of all sites for that database

Clients connect via:
(host, dbid/mneomnic)?
(host, dbid, uid, session-token)?

The latter allowing revocation of users.
But we don't have a way to grant access to users now anyhow.

identity and user mgmnt would need to be built in.

- Schema version negotiation becomes important?
- Migrations too for schema alterations

---

Can you change schema on client and have that pushed to server?
^- roles that are allowed to do this?

Need a way to manage the sync server...

---

Java and 1 write thread per db?
WAL mode on dbs.
Reads from any connection.

---

# yagni -- Simplest Thing that can Work

- express srv
- listens for websocket connections for given dbid
- negotiates schema version
- checks when last saw given site
- asks site for changes since it last saw client site
- client sends that batch and starts stream for all future batches
- enable websocket gzip

Client stream:
This stream must always pick up from where last message left off.
If server sees a gap between last end and next start, it must re-negotiate connection.

Server stream:
Must be contiguous wrt last end and next start as well.

Hiccups would lead to tear-down, re-create, re-start streams at `last_seen` record (for serv) and `since` request (for client).

---

# Load Test

- Max QPS per db?
