use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

#[test]
fn concat_columns() {
    // concat then unpack
    concat_columns_impl().unwrap();
}

// The rust test is mainly to check with valgrind and ensure we're correctly
// freeing data as we do some passing of destructors from rust to SQLite.
// Complete property based tests for encode & decode exist in python.
fn concat_columns_impl() -> Result<(), ResultCode> {
    let db = integration_utils::opendb()?;
    db.db.exec_safe("CREATE TABLE foo (id PRIMARY KEY, x, y)")?;
    let insert_stmt = db.db.prepare_v2("INSERT INTO foo VALUES (?, ?, ?)")?;
    let blob: [u8; 3] = [1, 2, 3];

    insert_stmt.bind_int(1, 12)?;
    insert_stmt.bind_text(2, "str", sqlite::Destructor::STATIC)?;
    insert_stmt.bind_blob(3, &blob, sqlite::Destructor::STATIC)?;
    insert_stmt.step()?;

    let select_stmt = db
        .db
        .prepare_v2("SELECT quote(crsql_concat_columns(id, x, y)) FROM foo")?;
    select_stmt.step()?;
    let result = select_stmt.column_text(0)?;
    println!("{}", result);
    assert!(result == "X'0301000000000000000C03000000037374720400000003010203'");

    let select_stmt = db
        .db
        .prepare_v2("SELECT crsql_concat_columns(id, x, y) FROM foo")?;
    select_stmt.step()?;
    let result = select_stmt.column_blob(0)?;

    // cols:03
    // type: 01 (integer)
    // value: 00 00 00 00 00 00 00 0C (12) TODO: encode as variable length integers to save space?
    // type: 03 (text)
    // len: 00 00 00 03 (3)
    // byes: 73 (s) 74 (t) 72 (r)
    // type: 04 (blob)
    // len: 00 00 00 03 (3)
    // bytes: 01 02 03
    // vs string:
    // 12|'str'|x'010203'
    // ^ 18 bytes
    // vs
    // 26 bytes
    // 13 wasted bytes due to not variable length encoding our integers
    Ok(())
}
