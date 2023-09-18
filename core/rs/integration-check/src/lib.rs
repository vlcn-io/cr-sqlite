mod t;
use sqlite_nostd as sqlite;

/**
 * Tests in a lib crate because ubuntu is seriously fucked
 * and can't find `sqlite3_malloc` when compiling in an integration test crate.
 */
#[no_mangle]
pub extern "C" fn crsql_integration_check() {
    t::automigrate::run_suite().expect("automigrate suite");
    t::backfill::run_suite().expect("backfill suite");
    t::fract::run_suite();
    t::pack_columns::run_suite().expect("pack columns suite");
    t::pk_only_tables::run_suite().expect("pk only tables suite");
    t::sync_bit_honored::run_suite().expect("sync bit honored suite");
    t::tableinfo::run_suite();
    t::teardown::tear_down_suite().expect("tear down suite");

    sqlite::shutdown();
}
