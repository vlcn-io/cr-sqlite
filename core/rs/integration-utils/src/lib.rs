use core::ffi::c_char;
use sqlite::{Connection, ManagedConnection, ResultCode};
use sqlite_nostd as sqlite;

pub fn opendb() -> Result<CRConnection, ResultCode> {
    let connection = sqlite::open(sqlite::strlit!(":memory:"))?;
    // connection.enable_load_extension(true)?;
    // connection.load_extension("../../dbg/crsqlite", None)?;
    Ok(CRConnection { db: connection })
}

pub struct CRConnection {
    pub db: ManagedConnection,
}

impl Drop for CRConnection {
    fn drop(&mut self) {
        if let Err(_) = self.db.exec_safe("SELECT crsql_finalize()") {
            panic!("Failed to finalize cr sql statements");
        }
    }
}
