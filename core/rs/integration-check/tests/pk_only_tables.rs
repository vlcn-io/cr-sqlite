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

#[test]
fn test_add() {
    assert_eq!(3 + 2, 5);
    let connection = opendb().unwrap();
    // load your extension
}
