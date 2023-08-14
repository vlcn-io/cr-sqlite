extern crate alloc;

use core::ffi::{c_char, c_int, c_void};

use crate::alloc::borrow::ToOwned;
use alloc::boxed::Box;
use alloc::format;
use alloc::string::String;
use sqlite::{sqlite3, Connection, CursorRef, StrRef, VTabArgs, VTabRef};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

// Virtual table definition to create a causal length set backed table.

#[repr(C)]
struct CLSetTab {
    base: sqlite::vtab,
    base_table_name: String,
    db_name: String,
    db: *mut sqlite3,
}

// used in response to `create virtual table ... using clset`
extern "C" fn create(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    argc: c_int,
    argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    err: *mut *mut c_char,
) -> c_int {
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
    let vtab_args = sqlite::parse_vtab_args(argc, argv)?;
    connect_create_shared(db, vtab, &vtab_args)?;

    // now we need to go and _create_ the backing storage / companion tables.
    // wrapped in a tx
    db.exec_safe("SAVEPOINT create_clset;")?;
    if let Err(rc) = create_clset_storage(db, &vtab_args, err)
        .and_then(|_| as_crr(db, base_name_from_virtual_name(vtab_args.table_name)))
    {
        let _ = db.exec_safe("ROLLBACK TO create_clset;");
        return Err(rc);
    }
    db.exec_safe("RELEASE create_clset;")
}

fn create_clset_storage(
    db: *mut sqlite::sqlite3,
    args: &VTabArgs,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    // Is the _last_ arg all the args? Or is it comma separated in some way?
    // What about index definitions...
    // Let the user later create them against the base table? Or via insertions into our vtab schema?
    let table_def = args.arguments.join(",");
    if !args.table_name.ends_with("_schema") {
        err.set("CLSet virtual table names must end with `_schema`");
        return Err(ResultCode::MISUSE);
    }

    db.exec_safe(&format!(
        "CREATE TABLE \"{db_name}\".\"{table_name}\" ({table_def})",
        db_name = crate::util::escape_ident(args.database_name),
        table_name = crate::util::escape_ident(base_name_from_virtual_name(args.table_name)),
        table_def = table_def
    ))
}

fn as_crr(db: *mut sqlite3, tbl_name: &str) -> Result<ResultCode, ResultCode> {
    let stmt = db.prepare_v2("SELECT crsql_as_crr(?);")?;
    stmt.bind_text(1, tbl_name, sqlite::Destructor::STATIC)?;
    stmt.step()
}

fn base_name_from_virtual_name(virtual_name: &str) -> &str {
    &virtual_name[0..(virtual_name.len() - "_schema".len())]
}

// connect to an existing virtual table previously created by `create virtual table`
extern "C" fn connect(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    argc: c_int,
    argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    _err: *mut *mut c_char,
) -> c_int {
    let vtab_args = sqlite::parse_vtab_args(argc, argv);
    match vtab_args {
        Ok(vtab_args) => match connect_create_shared(db, vtab, &vtab_args) {
            Ok(rc) | Err(rc) => rc as c_int,
        },
        Err(_e) => ResultCode::FORMAT as c_int,
    }
}

fn connect_create_shared(
    db: *mut sqlite::sqlite3,
    vtab: *mut *mut sqlite::vtab,
    args: &VTabArgs,
) -> Result<ResultCode, ResultCode> {
    sqlite::declare_vtab(db, "CREATE TABLE x(alteration TEXT);")?;
    let tab = Box::new(CLSetTab {
        base: sqlite::vtab {
            nRef: 0,
            pModule: core::ptr::null(),
            zErrMsg: core::ptr::null_mut(),
        },
        base_table_name: base_name_from_virtual_name(args.table_name).to_owned(),
        db_name: args.database_name.to_owned(),
        db: db,
    });
    vtab.set(tab);
    Ok(ResultCode::OK)
}

extern "C" fn best_index(_vtab: *mut sqlite::vtab, _index_info: *mut sqlite::index_info) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn disconnect(vtab: *mut sqlite::vtab) -> c_int {
    unsafe {
        drop(Box::from_raw(vtab));
    }
    ResultCode::OK as c_int
}

extern "C" fn destroy(vtab: *mut sqlite::vtab) -> c_int {
    let tab = unsafe { Box::from_raw(vtab.cast::<CLSetTab>()) };
    let ret = tab.db.exec_safe(&format!(
        "SAVEPOINT drop_ccr;
        DROP TABLE \"{db_name}\".\"{table_name}\";
        DROP TABLE \"{db_name}\".\"{table_name}__crsql_clock\";
        RELEASE drop_crr;",
        table_name = crate::util::escape_ident(&tab.base_table_name),
        db_name = crate::util::escape_ident(&tab.db_name)
    ));
    match ret {
        Err(rc) | Ok(rc) => rc as c_int,
    }
}

extern "C" fn open(_vtab: *mut sqlite::vtab, cursor: *mut *mut sqlite::vtab_cursor) -> c_int {
    cursor.set(Box::new(sqlite::vtab_cursor {
        pVtab: core::ptr::null_mut(),
    }));
    ResultCode::OK as c_int
}

extern "C" fn close(cursor: *mut sqlite::vtab_cursor) -> c_int {
    unsafe {
        drop(Box::from_raw(cursor));
    }
    ResultCode::OK as c_int
}

extern "C" fn filter(
    _cursor: *mut sqlite::vtab_cursor,
    _idx_num: c_int,
    _idx_str: *const c_char,
    _argc: c_int,
    _argv: *mut *mut sqlite::value,
) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn next(_cursor: *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn eof(_cursor: *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn column(
    _cursor: *mut sqlite::vtab_cursor,
    _ctx: *mut sqlite::context,
    _col_num: c_int,
) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn rowid(_cursor: *mut sqlite::vtab_cursor, _row_id: *mut sqlite::int64) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn begin(_vtab: *mut sqlite::vtab) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn commit(_vtab: *mut sqlite::vtab) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn rollback(_vtab: *mut sqlite::vtab) -> c_int {
    ResultCode::OK as c_int
}

static MODULE: sqlite_nostd::module = sqlite_nostd::module {
    iVersion: 0,
    xCreate: Some(create),
    xConnect: Some(connect),
    xBestIndex: Some(best_index),
    xDisconnect: Some(disconnect),
    xDestroy: Some(destroy),
    xOpen: Some(open),
    xClose: Some(close),
    xFilter: Some(filter),
    xNext: Some(next),
    xEof: Some(eof),
    xColumn: Some(column),
    xRowid: Some(rowid),
    xUpdate: None,
    xBegin: Some(begin),
    xSync: None,
    xCommit: Some(commit),
    xRollback: Some(rollback),
    xFindFunction: None,
    xRename: None,
    xSavepoint: None,
    xRelease: None,
    xRollbackTo: None,
    xShadowName: None,
};

pub fn create_module(db: *mut sqlite::sqlite3) -> Result<ResultCode, ResultCode> {
    db.create_module_v2("clset", &MODULE, None, None)?;

    // xCreate(|x| 0);

    Ok(ResultCode::OK)
}
