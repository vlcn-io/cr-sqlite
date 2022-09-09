# Issues

- We might need to store the current db version somewhere shared between all extensions for all connections
  - We have total changes to track total count in current connection: https://www.sqlite.org/c3ref/total_changes.html
  - We have PRAGMA data_version; to tell us if another connection made a change since we last checked if another conn made a change
  - We need global total change count, however.

Can we use [SQLITE_FCNTL_DATA_VERSION](https://www.sqlite.org/c3ref/c_fcntl_begin_atomic_write.html#sqlitefcntldataversion)?

Other options:

- Only allow a single connection for writes...
  - Probably fine given that writes are not concurrent (afaik) in sqlite anyhow (maybe they are in new wal mode?)
  - it is the write connection that bumps and reads the counter, not any other

---

# SQLite Extension in Rust

https://github.com/phiresky/sqlite-zstd
https://ricardoanderegg.com/posts/extending-sqlite-with-rust/

# SQLite Query Parser

https://crates.io/crates/sqlite3-parser

---

# Old / Irrelevant:

# PEG

PEG crate:
https://github.com/kevinmehall/rust-peg

Notes on left recursion:
https://github.com/seanyoung/lrpeg

#[cache_left_rec]

peg viz:
https://github.com/fasterthanlime/pegviz

# Create Table Parser

https://github.com/tantaman/sqlite-createtable-parser/blob/master/sql3parse_table.c

# Pest

https://github.com/tantaman/cf-sqlite/blob/c14db25acb8b0bcd81bb51f854073fbc5c1aa6d7/rust/parse/src/sqlite.pest
