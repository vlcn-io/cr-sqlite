#![no_std]

extern crate alloc;

use alloc::string::String;
use core::ffi::c_char;
use core::slice;
use sqlite_nostd as sqlite;

use sqlite::Connection;
use sqlite::Context;
use sqlite::Value;

pub extern "C" fn crsql_automigrate(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);
    if argc != 1 {
        ctx.result_error("expected 1 argument");
        return;
    }

    let schema = args[0].text();

    // if let db = sqlite::open(sqlite::strlit!(":memory:")) {
    // } else {
    //     ctx.result_error("failed to open in-memory db");
    //     return;
    // }
    /*
     * The automigrate algorithm:
     * 1. Pull the supplied schema version of the input string
     * 2. Ensure it is greater than db's current schema version
     * 3. open a new in-memory db (w crsqlite loaded in the mem db -- detect via pragma query)
     * 4. apply supplied schema against the memory db
     * 5. find dropped tables
     * 6. find new tables
     * 7. find modified tables
     *
     * Modified tables:
     * 1. find new columns
     * 2. find dropped columns
     * 3. find modified columns -- we can't do this given we don't have a stable identifier for columns
     *   -- well we could if only type information on the columns changed or primary key participation changed
     *   -- need to also figure out index changes
     */
    ctx.result_text_owned(String::from("ello mate!"));
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlautomigrate_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        sqlite::strlit!("crsql_automigrate"),
        1,
        sqlite::UTF8,
        None,
        Some(crsql_automigrate),
        None,
        None,
        None,
    )
    .unwrap_or(sqlite::ResultCode::ERROR) as u32
}
