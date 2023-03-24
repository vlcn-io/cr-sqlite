use core::ffi::c_char;
use sqlite::{Connection, ManagedConnection, ResultCode};
use sqlite_nostd as sqlite;

pub fn opendb() -> Result<ManagedConnection, ResultCode> {
    let connection = sqlite::open(sqlite::strlit!(":memory:"))?;
    connection.enable_load_extension(true)?;
    connection.load_extension("../../dbg/crsqlite", None)?;
    Ok(connection)
}

pub fn closedb(db: ManagedConnection) -> Result<(), ResultCode> {
    db.exec_safe("SELECT crsql_finalize()")?;
    // no close, close gets called on drop.
    Ok(())
}

// macro_rules! wrap_fn {
//     ( $name:ident, $body:expr ) => {

//         fn $name() $body
//     };
// }

#[macro_export]
macro_rules! counter_setup {
    ( $count:expr ) => {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new($count);

        fn decrement_counter() {
            if COUNTER.fetch_sub(1, Ordering::SeqCst) == 1 {
                sqlite::shutdown();
            }
        }
    };
}

// Macro to allow `afterAll` tear down once all tests complete
// Works by bumping a static counter on each fn def
// then by calling `afterAll` which checks the counter
