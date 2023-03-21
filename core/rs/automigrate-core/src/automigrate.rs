extern crate alloc;

// use alloc::string::String;
// use alloc::vec;
// use alloc::vec::Vec;
use core::ffi::c_char;
use core::slice;
// use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use sqlite::Connection;
use sqlite::Context;
// use sqlite::Value;

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

    // let schema = args[0].text();

    // let schema_version = pull_schema_version(schema);
    let db = sqlite::open(sqlite::strlit!(":memory:"));
    if !db.is_ok() {
        ctx.result_error(
            "failed to open the in-memory db required to calculate schema modifications",
        );
        return;
    }

    let stmt = db
        .unwrap()
        .prepare_v2("SELECT count(*) FROM pragma_function_list WHERE name = 'crsql_automigrate';")
        .unwrap();
    stmt.step().unwrap();
    let name = stmt.column_text(0).unwrap();
    ctx.result_text_transient(name);
    // let db = db.unwrap();

    /*
    Could remove all the crrs statements...
    Or load the crr extensions back in...
    Or parse all the things...
    Have an arg to provide all extensions to load and their paths...
     */

    /*
    * The automigrate algorithm:
    * 1. Pull the supplied schema version of the input string
    * 2. Ensure it is greater than db's current schema version
    * 3. open a new in-memory db (w crsqlite loaded in the mem db -- detect via pragma query)
    * SELECT count(*) FROM pragma_function_list WHERE name = 'crsql_automigrate';
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
    *
    * What do when primary key participation changes?
    * Would necessitate dropping all clock entries and re-creating?
    *
    * Test:
    * - All clock entries for removed columns are dropped
    * - How shall this interact with your `crsql_migrate_begin` methods?
    *  - These need testing to ensure proper clock table bookkeeping
    *  - Resurrect corretness tests?
    *  - Change py sqlite default config to auto-commit / tx?

    We can use `crsql_begin_alter` to do all the relevant bookkeeping.
    We only need to gather the diffs here.

    The diffs are gathered by comparing pragmas between both DBs for tables and table infos.
    */
    // ctx.result_text_owned(String::from("ello mate!"));
}

// fn crsql_automigrate_impl() -> Result<ResultCode, ResultCode> {
//     Ok(ResultCode::OK)
// }

// fn find_dropped_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// fn find_new_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// struct ModifiedTable {
//     name: String,
//     new_columns: Vec<String>,
//     dropped_columns: Vec<String>,
//     modified_columns: Vec<String>,
// }

// fn find_modified_tables() -> Result<Vec<ModifiedTable>, ResultCode> {
//     Ok(vec![])
// }

// fn pull_schema_version(schema: &str) {
//     // pull first line
// }

#[no_mangle]
pub extern "C" fn sqlite3_crsqlautomigrate_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        "crsql_automigrate",
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
