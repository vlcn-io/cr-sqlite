/*
 * Copyright 2023 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Test that we can backfill old tables
use core::ffi::c_char;
use sqlite::ManagedConnection;
use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

fn opendb() -> Result<ManagedConnection, ResultCode> {
    let connection = sqlite::open(sqlite::strlit!(":memory:"))?;
    connection.enable_load_extension(true)?;
    connection.load_extension("../../dbg/crsqlite", None)?;
    Ok(connection)
}

fn closedb(db: ManagedConnection) -> Result<(), ResultCode> {
    db.exec_safe("SELECT crsql_finalize()")?;
    // no close, it gets called on drop.
    Ok(())
}

#[test]
fn new_empty_table() {
    new_empty_table_impl().unwrap();
}

fn new_empty_table_impl() -> Result<(), ResultCode> {
    let db = opendb()?;
    // Just testing that we can execute these statements without error
    db.exec_safe("CREATE TABLE foo (id PRIMARY KEY, name);")?;
    db.exec_safe("SELECT crsql_as_crr('foo');")?;
    db.exec_safe("SELECT * FROM foo__crsql_clock;")?;
    closedb(db)
}

#[test]
fn new_nonempty_table() {
    new_nonempty_table_impl().unwrap();
}

fn new_nonempty_table_impl() -> Result<(), ResultCode> {
    let db = opendb()?;
    db.exec_safe("CREATE TABLE foo (id PRIMARY KEY, name);")?;
    db.exec_safe("INSERT INTO foo VALUES (1, 'one'), (2, 'two');")?;
    db.exec_safe("SELECT crsql_as_crr('foo');")?;
    let stmt = db.prepare_v2("SELECT * FROM foo__crsql_clock;")?;

    let mut cnt = 0;
    while stmt.step()? == ResultCode::ROW {
        cnt = cnt + 1;
        assert_eq!(stmt.column_int64(0)?, cnt); // pk
        assert_eq!(stmt.column_text(1)?, "name"); // col name
        assert_eq!(stmt.column_int64(2)?, 1); // col version
        assert_eq!(stmt.column_int64(3)?, 1); // db version
    }
    assert_eq!(cnt, 2);

    // select from crsql_changes too

    closedb(db)
}

#[test]
fn reapplied_empty_table() {
    reapplied_empty_table_impl().unwrap();
}

fn reapplied_empty_table_impl() -> Result<(), ResultCode> {
    Ok(())
}

#[test]
fn reapplied_nonempty_table_with_newdata() {}
