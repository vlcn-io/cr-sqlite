/*
 * Copyright 2022 One Law LLC. All Rights Reserved.
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
use core::ffi::c_char;
use sqlite::ColumnType;
use sqlite::Destructor;
use sqlite::ManagedConnection;
use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

fn sync_left_to_right(
    l: &dyn Connection,
    r: &dyn Connection,
    since: sqlite::int64,
) -> Result<ResultCode, ResultCode> {
    let siteid_stmt = r.prepare_v2("SELECT crsql_siteid()").unwrap();
    siteid_stmt.step().unwrap();
    let siteid = siteid_stmt.column_blob(0).unwrap();

    let stmt_l = l
        .prepare_v2("SELECT * FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?")
        .unwrap();
    stmt_l.bind_int64(1, since).unwrap();
    stmt_l.bind_blob(2, siteid, Destructor::STATIC).unwrap();

    while stmt_l.step()? == ResultCode::ROW {
        let stmt_r = r
            .prepare_v2("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)")
            .unwrap();
        for x in 0..7 {
            stmt_r.bind_value(x + 1, stmt_l.column_value(x)?).unwrap();
        }
        stmt_r.step().unwrap();
    }
    Ok(ResultCode::OK)
}

fn print_changes(
    db: &dyn Connection,
    for_db: Option<&dyn Connection>,
) -> Result<ResultCode, ResultCode> {
    let stmt = if let Some(for_db) = for_db {
        let siteid_stmt = for_db.prepare_v2("SELECT crsql_siteid()").unwrap();
        siteid_stmt.step().unwrap();
        let siteid = siteid_stmt.column_blob(0).unwrap();
        let stmt = db.prepare_v2(
          "SELECT [table], [pk], [cid], [val], [col_version], [db_version], quote([site_id]) FROM crsql_changes WHERE site_id IS NOT ?",
        ).unwrap();
        stmt.bind_blob(1, siteid, Destructor::STATIC).unwrap();
        stmt
    } else {
        db.prepare_v2(
          "SELECT [table], [pk], [cid], [val], [col_version], [db_version], quote([site_id]) FROM crsql_changes",
        )?
    };

    while stmt.step()? == ResultCode::ROW {
        println!(
            "{}, {}, {}, {}, {}, {}, {}",
            stmt.column_text(0)?,
            stmt.column_text(1)?,
            stmt.column_text(2)?,
            if stmt.column_type(3)? == ColumnType::Null {
                ""
            } else {
                stmt.column_text(3)?
            },
            stmt.column_int64(4)?,
            stmt.column_int64(5)?,
            stmt.column_text(6)?,
        );
    }
    Ok(sqlite::ResultCode::OK)
}

fn opendb() -> Result<ManagedConnection, ResultCode> {
    let connection = sqlite::open(sqlite::strlit!(":memory:")).unwrap();
    connection.enable_load_extension(true).unwrap();
    connection
        .load_extension("../../dbg/crsqlite", None)
        .unwrap();
    Ok(connection)
}

fn closedb(db: ManagedConnection) -> Result<(), ResultCode> {
    db.exec_safe("SELECT crsql_finalize()").unwrap();
    // no close, it gets called on drop.
    Ok(())
}

fn setup_schema(db: &ManagedConnection) -> Result<ResultCode, ResultCode> {
    db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")
        .unwrap();
    db.exec_safe("SELECT crsql_as_crr('foo');")
}

#[test]
fn create_pkonlytable() {
    // just expecting not to throw
    create_pkonlytable_impl().unwrap();
}

#[test]
fn insert_pkonly_row() {
    insert_pkonly_row_impl().unwrap();
}

#[test]
fn modify_pkonly_row() {
    // inserts then updates then syncs the value of a pk column
    // inserts, syncs, then updates then syncs
    //
    // repeat for single column keys and compound
    modify_pkonly_row_impl().unwrap()
}

#[test]
/// Test a common configuration of a junction/edge table (with no edge data)
/// to relate two relations.
fn junction_table() {
    // junction_table_impl().unwrap();
}

fn create_pkonlytable_impl() -> Result<(), ResultCode> {
    let db_a = opendb().unwrap();

    setup_schema(&db_a).unwrap();
    closedb(db_a).unwrap();
    Ok(())
}

fn insert_pkonly_row_impl() -> Result<(), ResultCode> {
    let db_a = opendb().unwrap();
    let db_b = opendb().unwrap();

    fn setup_schema(db: &ManagedConnection) -> Result<ResultCode, ResultCode> {
        db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")
            .unwrap();
        db.exec_safe("SELECT crsql_as_crr('foo');")
    }

    setup_schema(&db_a).unwrap();
    setup_schema(&db_b).unwrap();

    let stmt = db_a.prepare_v2("INSERT INTO foo (id) VALUES (?);").unwrap();
    stmt.bind_int(1, 1).unwrap();
    stmt.step().unwrap();

    let stmt = db_a.prepare_v2("SELECT * FROM crsql_changes;").unwrap();
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::ROW);

    sync_left_to_right(&db_a, &db_b, -1).unwrap();

    let stmt = db_b.prepare_v2("SELECT * FROM foo;").unwrap();
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::ROW);
    let id = stmt.column_int(0).unwrap();
    assert_eq!(id, 1);
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::DONE);

    closedb(db_a).unwrap();
    closedb(db_b).unwrap();
    Ok(())
}

fn modify_pkonly_row_impl() -> Result<(), ResultCode> {
    let db_a = opendb().unwrap();
    let db_b = opendb().unwrap();

    fn setup_schema(db: &ManagedConnection) -> Result<ResultCode, ResultCode> {
        db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")
            .unwrap();
        db.exec_safe("SELECT crsql_as_crr('foo');")
    }

    setup_schema(&db_a).unwrap();
    setup_schema(&db_b).unwrap();

    let stmt = db_a.prepare_v2("INSERT INTO foo (id) VALUES (1);").unwrap();
    stmt.step().unwrap();

    let stmt = db_a
        .prepare_v2("UPDATE foo SET id = 2 WHERE id = 1;")
        .unwrap();
    stmt.step().unwrap();

    sync_left_to_right(&db_a, &db_b, -1).unwrap();

    let stmt = db_b.prepare_v2("SELECT * FROM foo;").unwrap();
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::ROW);
    let id = stmt.column_int(0).unwrap();
    assert_eq!(id, 2);
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::DONE);

    Ok(())
}

// Current issue with this test is that we're not recording the actual
// delete event on update of primary key. We're creating a synthetic one
// on read from `changes` when the target row is missing.
fn junction_table_impl() -> Result<(), ResultCode> {
    let db_a = opendb().unwrap();
    let db_b = opendb().unwrap();

    fn setup_schema(db: &ManagedConnection) -> Result<ResultCode, ResultCode> {
        db.exec_safe("CREATE TABLE jx (id1, id2, PRIMARY KEY(id1, id2));")
            .unwrap();
        db.exec_safe("SELECT crsql_as_crr('jx');")
    }

    setup_schema(&db_a).unwrap();
    setup_schema(&db_b).unwrap();

    db_a.prepare_v2("INSERT INTO jx VALUES (1, 2);")?
        .step()
        .unwrap();
    db_a.prepare_v2("UPDATE jx SET id2 = 3 WHERE id1 = 1 AND id2 = 2")?
        .step()
        .unwrap();

    sync_left_to_right(&db_a, &db_b, -1).unwrap();
    let stmt = db_b.prepare_v2("SELECT * FROM jx;").unwrap();
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::ROW);
    let id1 = stmt.column_int(0).unwrap();
    let id2 = stmt.column_int(1).unwrap();
    assert_eq!(id1, 1);
    assert_eq!(id2, 3);
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::DONE);

    db_b.prepare_v2("UPDATE jx SET id1 = 2 WHERE id1 = 1 AND id2 = 3")?
        .step()
        .unwrap();

    println!("A before sync");
    print_changes(&db_a, None).unwrap();

    sync_left_to_right(&db_b, &db_a, -1).unwrap();

    println!("B");
    print_changes(&db_b, None).unwrap();
    println!("A after sync");
    print_changes(&db_a, None).unwrap();

    let stmt = db_a.prepare_v2("SELECT * FROM jx;").unwrap();
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::ROW);
    let id1 = stmt.column_int(0).unwrap();
    let id2 = stmt.column_int(1).unwrap();
    assert_eq!(id1, 1);
    assert_eq!(id2, 3);
    let result = stmt.step().unwrap();
    assert_eq!(result, ResultCode::DONE);

    // insert an edge
    // check it
    // modify the edge to point to something new
    // check it
    // change source of edge
    // check it
    // delete the edge
    // check it

    Ok(())
}
