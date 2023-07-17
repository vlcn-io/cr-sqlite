pub const TBL_SITE_ID: &'static str = "__crsql_siteid";
pub const TBL_SCHEMA: &'static str = "crsql_master";
pub const CLOCK_TABLES_SELECT: &'static str =
    "SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__crsql_clock'";
pub const CRSQLITE_VERSION: i32 = 130000;
pub const SITE_ID_LEN: usize = 16;
