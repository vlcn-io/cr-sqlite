<<<<<<< HEAD
use std::env;
use std::ffi::c_void;
use std::ptr;

extern crate crsql_bundle;

extern "C" {
    pub fn core_init(d: *mut c_char);
}

pub fn main() {
    println!("Hello, world!");
    let args: Vec<String> = env::args().collect();
    if args.len() > 5 {
        unsafe {
            core_init(ptr::null_mut());
        }
    }
=======
mod t;
use sqlite_nostd as sqlite;

pub fn main() {
    // sqlite::initialize().expect("initialize sqlite");
    crsql_integration_check();
    sqlite::shutdown();
}

/**
 * Tests in a main crate because ubuntu is seriously fucked
 * and can't find `sqlite3_malloc` when compiling it as integration tests.
 */
fn crsql_integration_check() {
    t::automigrate::run_suite().expect("automigrate suite");
    t::backfill::run_suite().expect("backfill suite");
    t::fract::run_suite();
    t::pack_columns::run_suite().expect("pack columns suite");
    t::pk_only_tables::run_suite().expect("pk only tables suite");
    t::sync_bit_honored::run_suite().expect("sync bit honored suite");
    t::tableinfo::run_suite();
    t::teardown::run_suite().expect("tear down suite");
    t::test_cl_set_vtab::run_suite().expect("test cl set vtab suite");
>>>>>>> 861cc74c (run as a main crate)
}
