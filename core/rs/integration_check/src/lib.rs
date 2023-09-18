mod t;
use colored::*;
pub use crsql_bundle;
use sqlite_nostd as sqlite;

/**
 * Tests in a main crate because ubuntu is seriously fucked
 * and can't find `sqlite3_malloc` when compiling it as integration tests.
 */
#[no_mangle]
pub extern "C" fn crsql_integration_check() {
    println!("Running {}", "auotmigrate".green());
    t::automigrate::run_suite().expect("automigrate suite");
    println!("Running {}", "backfill".green());
    t::backfill::run_suite().expect("backfill suite");
    println!("Running {}", "fract".green());
    t::fract::run_suite();
    println!("Running {}", "pack_columns".green());
    t::pack_columns::run_suite().expect("pack columns suite");
    println!("Running {}", "pk_only_tables".green());
    t::pk_only_tables::run_suite().expect("pk only tables suite");
    println!("Running {}", "sync_bit_honored".green());
    t::sync_bit_honored::run_suite().expect("sync bit honored suite");
    println!("Running {}", "tableinfo".green());
    t::tableinfo::run_suite();
    println!("Running {}", "teardown".green());
    t::teardown::run_suite().expect("tear down suite");
    println!("Running {}", "cl_set_vtab".green());
    t::test_cl_set_vtab::run_suite().expect("test cl set vtab suite");
}
