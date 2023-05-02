- DBs should auto-migrate to current schema version on open.
- No external "migrate" command
- A "set as current" command for a given schema version, however.

  - this'll migrate all currently open DBs and restart their connections
  - will migrate other dbs as they open

- Get changes with a limit!

  - add artificial limit if one is not provided.
  - allow specifying upper version too so we can fetch gaps!

- Live re-slurp on nextjs schema file changes!
