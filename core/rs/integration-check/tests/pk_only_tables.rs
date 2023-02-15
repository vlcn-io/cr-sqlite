use core::ffi::c_char;
use sqlite::Destructor;
use sqlite::ManagedConnection;
use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

fn sync_left_to_right(
    l: &dyn Connection,
    r: &dyn Connection,
    since: sqlite::int64,
) -> Result<sqlite::ResultCode, sqlite::ResultCode> {
    let siteid_stmt = r.prepare_v2("SELECT crsql_siteid()")?;
    siteid_stmt.step()?;
    let siteid = siteid_stmt.column_blob(0)?;

    let stmt_l =
        l.prepare_v2("SELECT * FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?")?;
    stmt_l.bind_int64(1, since)?;
    stmt_l.bind_blob(2, siteid, Destructor::STATIC)?;

    while stmt_l.step()? == sqlite::ResultCode::ROW {
        let stmt_r = r.prepare_v2("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)")?;
        for x in 0..7 {
            stmt_r.bind_value(x + 1, stmt_l.column_value(x)?)?;
        }
        stmt_r.step()?;
    }
    Ok(sqlite::ResultCode::OK)
}

fn opendb() -> Result<ManagedConnection, sqlite::ResultCode> {
    let connection = sqlite::open(sqlite::strlit!(":memory:"))?;
    connection.enable_load_extension(true)?;
    connection.load_extension("../../dist/crsqlite", None)?;
    Ok(connection)
}

fn closedb(db: ManagedConnection) -> Result<(), sqlite::ResultCode> {
    db.exec_safe("SELECT crsql_finalize()")?;
    // no close, it gets called on drop.
    Ok(())
}

fn setup_schema(db: &ManagedConnection) -> Result<sqlite::ResultCode, sqlite::ResultCode> {
    db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")?;
    db.exec_safe("SELECT crsql_as_crr('foo');")
}

#[test]
fn create_pkonlytable() {
    // just expecting not to throw
    create_pkonlytable_impl().unwrap();
}

fn create_pkonlytable_impl() -> Result<(), sqlite::ResultCode> {
    let db_a = opendb()?;

    setup_schema(&db_a)?;
    closedb(db_a)?;
    Ok(())
}

#[test]
fn insert_pkonly_row() {
    insert_pkonly_row_impl().unwrap();
}

fn insert_pkonly_row_impl() -> Result<(), sqlite::ResultCode> {
    let db_a = opendb()?;
    let db_b = opendb()?;

    fn setup_schema(db: &ManagedConnection) -> Result<sqlite::ResultCode, sqlite::ResultCode> {
        db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")?;
        db.exec_safe("SELECT crsql_as_crr('foo');")
    }

    setup_schema(&db_a)?;
    setup_schema(&db_b)?;

    let stmt = db_a.prepare_v2("INSERT INTO foo (id) VALUES (?);")?;
    stmt.bind_int(1, 1)?;
    stmt.step()?;

    let stmt = db_a.prepare_v2("SELECT * FROM crsql_changes;")?;
    let result = stmt.step()?;
    assert_eq!(result, ResultCode::ROW);

    sync_left_to_right(&db_a, &db_b, -1)?;

    let stmt = db_b.prepare_v2("SELECT * FROM foo;")?;
    let result = stmt.step()?;
    assert_eq!(result, ResultCode::ROW);
    let id = stmt.column_int(0)?;
    assert_eq!(id, 1);
    let result = stmt.step()?;
    assert_eq!(result, ResultCode::DONE);

    closedb(db_a)?;
    closedb(db_b)?;
    Ok(())
}
