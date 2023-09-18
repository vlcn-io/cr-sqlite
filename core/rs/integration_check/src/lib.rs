#![no_std]

mod t;
pub use crsql_bundle;
use libc_print::std_name::println;
use sqlite_nostd as sqlite;

/**
 * Tests in a main crate because ubuntu is seriously fucked
 * and can't find `sqlite3_malloc` when compiling it as integration tests.
 */
#[no_mangle]
pub extern "C" fn crsql_integration_check() {
    println!("Running automigrate");
    t::automigrate::run_suite().expect("automigrate suite");
    println!("Running backfill");
    t::backfill::run_suite().expect("backfill suite");
    println!("Running fract");
    t::fract::run_suite();
    println!("Running pack_columns");
    t::pack_columns::run_suite().expect("pack columns suite");
    println!("Running pk_only_tables");
    t::pk_only_tables::run_suite().expect("pk only tables suite");
    println!("Running sync_bit_honored");
    t::sync_bit_honored::run_suite().expect("sync bit honored suite");
    println!("Running run_suite");
    t::tableinfo::run_suite();
    println!("Running tear_down");
    t::teardown::run_suite().expect("tear down suite");
    println!("Running cl_set_vtab");
    t::test_cl_set_vtab::run_suite().expect("test cl set vtab suite");
}
