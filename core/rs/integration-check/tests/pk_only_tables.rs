use core::ffi::c_char;
use sqlite::Connection;
use sqlite::ManagedConnection;
use sqlite_nostd as sqlite;

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
    // let db_a = opendb()?;
    // let db_b = opendb()?;

    // fn setup_schema(db: &ManagedConnection) -> Result<sqlite::ResultCode, sqlite::ResultCode> {
    //     db.exec_safe("CREATE TABLE foo (id INTEGER PRIMARY KEY);")?;
    //     db.exec_safe("SELECT crsql_as_crr('foo');")
    // }

    // setup_schema(&db_a)?;
    // setup_schema(&db_b)?;

    // let stmt = db_a.prepare_v2("INSERT INTO foo (id) VALUES (?);")?;
    // stmt.bind_int(1, 1)?;
    // stmt.step()?;

    // closedb(db_a)?;
    // closedb(db_b)?;
    Ok(())
}
