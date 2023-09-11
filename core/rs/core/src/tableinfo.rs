use alloc::format;
use core::ffi::c_char;
use sqlite_nostd as sqlite;
use sqlite_nostd::Connection;
use sqlite_nostd::ResultCode;
use sqlite_nostd::StrRef;

pub fn is_table_compatible(db: *mut sqlite::sqlite3, table: &str, err: *mut *mut c_char) -> bool {
    // No unique indices besides primary key
    let sql = format!(
        "SELECT count(*) FROM pragma_index_list('{table}')
        WHERE \"origin\" != 'pk' AND \"unique\" = 1"
    );
    match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.step()?;
        stmt.column_int(0)
    }) {
        Err(_) => {
            err.set(&format!("Failed to analyze index information for {table}"));
            return false;
        }
        Ok(0) => {}
        Ok(_) => {
            err.set(&format!(
                "Table {table} has unique indices besides\
                    the primary key. This is not allowed for CRRs"
            ));
            return false;
        }
    };

    // Must have a primary key
    let sql = format!(
        // pragma_index_list does not include primary keys that alias rowid...
        // hence why we cannot use
        // `select * from pragma_index_list where origin = pk`
        "SELECT count(*) FROM pragma_table_info('{table}')
        WHERE \"pk\" > 0"
    );
    match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.step()?;
        stmt.column_int(0)
    }) {
        Err(_) => {
            err.set(&format!(
                "Failed to analyze primary key information for {table}"
            ));
            return false;
        }
        Ok(0) => {
            err.set(&format!(
                "Table {table} has no primary key. \
                CRRs must have a primary key"
            ));
            return false;
        }
        _ => {}
    };

    // No auto-increment primary keys
    let sql = format!(
        "SELECT 1 FROM sqlite_master WHERE name = ? AND type = 'table' AND sql
        LIKE '%autoincrement%' limit 1"
    );
    match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
        stmt.step()
    }) {
        Err(_) => {
            err.set(&format!(
                "Failed to analyze autoincrement status for {table}"
            ));
            return false;
        }
        Ok(ResultCode::ROW) => {
            err.set(&format!(
                "{table} has auto-increment primary keys. This is likely a mistake as two \
                concurrent nodes will assign unrelated rows the same primary key. \
                Either use a primary key that represents the identity of your row or \
                use a database friendly UUID such as UUIDv7"
            ));
            return false;
        }
        Ok(_) => {}
    };

    // No checked foreign key constraints
    let sql = format!("SELECT count(*) FROM pragma_foreign_key_list('{table}')");
    match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.step()?;
        stmt.column_int(0)
    }) {
        Err(_) => {
            err.set(&format!(
                "Failed to analyze foreign key information for {table}"
            ));
            return false;
        }
        Ok(0) => {}
        Ok(_) => {
            err.set(&format!(
                "Table {table} has checked foreign key constraints. \
                CRRs may have foreign keys but must not have \
                checked foreign key constraints as they can be violated \
                by row level security or replication."
            ));
            return false;
        }
    };

    // Check for default value or nullable
    let sql = format!(
        "SELECT count(*) FROM pragma_table_xinfo('{table}')
        WHERE \"notnull\" = 1 AND \"dflt_value\" IS NULL AND \"pk\" = 0"
    );
    match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.step()?;
        stmt.column_int(0)
    }) {
        Err(_) => {
            err.set(&format!(
                "Failed to analyze default value information for {table}"
            ));
            return false;
        }
        Ok(0) => return true,
        Ok(_) => {
            err.set(&format!(
                "Table {table} has a NOT NULL column without a DEFAULT VALUE. \
                This is not allowed as it prevents forwards and backwards \
                compatibility between schema versions. Make the column \
                nullable or assign a default value to it."
            ));
            return false;
        }
    };
}
