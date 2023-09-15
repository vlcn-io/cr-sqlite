use std::ffi::{c_char, CString};

use crsql_bundle::crsql_core;
use sqlite::Connection;
use sqlite_nostd as sqlite;

// janx hax to do an `afterAll` cleanup
integration_utils::counter_setup!(1);

fn make_err_ptr() -> *mut *mut c_char {
    let mut inner_ptr: *mut c_char = std::ptr::null_mut();
    let outer_ptr: *mut *mut c_char = &mut inner_ptr;
    outer_ptr
}

fn make_site() -> *mut c_char {
    let inner_ptr: *mut c_char = CString::new("0000000000000000").unwrap().into_raw();
    inner_ptr
}

// https://github.com/vlcn-io/cr-sqlite/pull/353/files#diff-6097dc2328b422bd90f6f46c9cd066c15238a757d3a7a92fb6d1964468657f7cL1
#[test]
fn test_ensure_table_infos_are_up_to_date() {
    let db = integration_utils::opendb().expect("Opened DB");
    let c = &db.db;
    let raw_db = db.db.db;

    // manually create some clock tables w/o using the extension
    // pull table info and ensure it is what we expect
    c.exec_safe("CREATE TABLE foo (a PRIMARY KEY, b);")
        .expect("made foo");
    c.exec_safe(
        "CREATE TABLE foo__crsql_clock (
      id,
      __crsql_col_name,
      __crsql_col_version,
      __crsql_db_version,
      __crsql_site_id,
      __crsql_seq
    )",
    )
    .expect("made foo clock");

    let ext_data = unsafe { crsql_core::c::crsql_newExtData(raw_db, make_site()) };
    crsql_core::tableinfo::crsql_ensure_table_infos_are_up_to_date(
        raw_db,
        ext_data,
        make_err_ptr(),
    );

    // ideally we can check if it does a repull or not...
    // we could do this by mutating table infos to something unexpected and checking it is still that.
    decrement_counter();
}

#[test]
fn test_pull_table_info() {
    // assert_eq!(add(1, 2), 3);
}

#[test]
fn test_find_table_info() {}

#[test]
fn test_find_table_info_index() {}

#[test]
fn test_is_table_compatible() {}

#[test]
fn test_slab_rowid() {}

// https://github.com/vlcn-io/cr-sqlite/pull/353/files#diff-6d6b961ba2bd1905d0f357b72927a8707992abc533322fe95f7d134421919ef1R83
#[test]
fn test_create_clock_table_from_table_info() {}
