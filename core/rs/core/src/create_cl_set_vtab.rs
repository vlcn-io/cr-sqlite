extern crate alloc;

use core::ffi::{c_char, c_int, c_void};
use core::slice;

use alloc::boxed::Box;
use alloc::ffi::CString;
use alloc::format;
use alloc::vec::Vec;
use sqlite::{Connection, Context, StrRef, VTabArgs, VTabRef, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

// Virtual table definition to create a causal length set backed table.

// used in response to `create virtual table ... using clset`
extern "C" fn create(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    argc: c_int,
    argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    err: *mut *mut c_char,
) -> c_int {
    let args = sqlite::parse_vtab_args(argc, argv);
    match create_impl(db, argc, argv, vtab, err) {
        Ok(rc) | Err(rc) => rc as c_int,
    }
}

fn create_impl(
    db: *mut sqlite::sqlite3,
    argc: c_int,
    argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    // This is the schema component
    sqlite::declare_vtab(
        db,
        "CREATE TABLE x(column_name TEXT, column_type TEXT, crdt_type TEXT);",
    )?;
    let tab = Box::new(sqlite::vtab {
        nRef: 0,
        pModule: core::ptr::null(),
        zErrMsg: core::ptr::null_mut(),
    });
    vtab.set(tab);
    sqlite::vtab_config(db, sqlite::INNOCUOUS);

    // now we need to go and _create_ the backing storage / companion tables.
    let vtab_args = sqlite::parse_vtab_args(argc, argv)?;
    create_clset_storage(db, vtab_args, err)
}

fn create_clset_storage(
    db: *mut sqlite::sqlite3,
    args: VTabArgs,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    // Is the _last_ arg all the args? Or is it comma separated in some way?
    // What about index definitions...
    // Let the user later create them against the base table? Or via insertions into our vtab schema?
    let table_def = args.arguments.first();
    if !args.table_name.ends_with("_schema") {
        err.set("CLSet virtual table names must end with `_schema`");
        return Err(ResultCode::MISUSE);
    }
    match table_def {
        None => {
            err.set("CLSet requires a table definition body.");
            Err(ResultCode::MISUSE)
        }
        Some(table_def) => db.exec_safe(&format!(
            "CREATE TABLE {table_name} ({table_def})",
            table_name = &args.table_name[0..(args.table_name.len() - "_schema".len())],
            table_def = table_def
        )),
    }
}

// connect to an existing virtual table previously created by `create virtual table`
extern "C" fn connect(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    _argc: c_int,
    _argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    _err: *mut *mut c_char,
) -> c_int {
    0
}

extern "C" fn best_index(vtab: *mut sqlite::vtab, index_info: *mut sqlite::index_info) -> c_int {
    0
}

extern "C" fn disconnect(vtab: *mut sqlite::vtab) -> c_int {
    unsafe {
        drop(Box::from_raw(vtab));
    }
    ResultCode::OK as c_int
}

extern "C" fn open(_vtab: *mut sqlite::vtab, cursor: *mut *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn close(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn filter(
    cursor: *mut sqlite::vtab_cursor,
    _idx_num: c_int,
    _idx_str: *const c_char,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) -> c_int {
    0
}

extern "C" fn next(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn eof(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn column(
    cursor: *mut sqlite::vtab_cursor,
    ctx: *mut sqlite::context,
    col_num: c_int,
) -> c_int {
    0
}

extern "C" fn rowid(cursor: *mut sqlite::vtab_cursor, row_id: *mut sqlite::int64) -> c_int {
    0
}

static MODULE: sqlite_nostd::module = sqlite_nostd::module {
    iVersion: 0,
    xCreate: Some(create),
    xConnect: Some(connect),
    xBestIndex: Some(best_index),
    xDisconnect: Some(disconnect),
    xDestroy: None,
    xOpen: Some(open),
    xClose: Some(close),
    xFilter: Some(filter),
    xNext: Some(next),
    xEof: Some(eof),
    xColumn: Some(column),
    xRowid: Some(rowid),
    xUpdate: None,
    xBegin: None,
    xSync: None,
    xCommit: None,
    xRollback: None,
    xFindFunction: None,
    xRename: None,
    xSavepoint: None,
    xRelease: None,
    xRollbackTo: None,
    xShadowName: None,
};

/**
* CREATE TABLE [x] (cell, package HIDDEN);
* SELECT cell FROM crsql_unpack_columns WHERE package = ___;
*/
pub fn create_module(db: *mut sqlite::sqlite3) -> Result<ResultCode, ResultCode> {
    db.create_module_v2("CLSet", &MODULE, None, None)?;

    // xCreate(|x| 0);

    Ok(ResultCode::OK)
}
