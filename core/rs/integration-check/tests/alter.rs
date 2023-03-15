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

/*
test:
- removing a col drops clocks for col
- adding a col backfills default values or null
- modifying primary key participation
    - this should just completely reset the clock table
        since identities are completely different now.
    - but you could get a pk concatenation that matches an old pk setup...
        so.. pk names should be passed along?
        schemaboi for msg send?

        This reset should be fine given that we will not
        replicate between ppl with mismatch schema version
*/
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
fn drop_clocks_on_col_remove() {}

#[test]
fn backfill_clocks_on_col_add() {}

#[test]
fn clock_recreation_ok_pk_alter() {}

fn drop_clocks_on_col_remove_impl() -> Result<(), ResultCode> {
    let db = opendb()?;

    db.exec_safe("CREATE TABLE todo (id PRIMARY KEY, name, complete, list);")?;
    db.exec_safe("SELECT crsql_as_crr('foo');")?;
    db.exec_safe("INSERT INTO todo VALUES (1, 'cook', 0, 'home');")?;

    let stmt = db.prepare_v2("SELECT [table], [pk], [cid], [val] FROM crsql_changes")?;
    while (stmt.step()? == ResultCode::ROW) {}

    closedb(db)
}

fn backfill_clocks_on_col_add_impl() -> Result<(), ResultCode> {
    Ok(())
}

fn clock_recreation_on_pk_alter() -> Result<(), ResultCode> {
    Ok(())
}
