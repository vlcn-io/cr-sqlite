use crate::alloc::string::ToString;
use crate::c::crsql_ExtData;
use crate::c::crsql_fetchPragmaSchemaVersion;
use crate::c::TABLE_INFO_SCHEMA_VERSION;
use crate::util::Countable;
use alloc::boxed::Box;
use alloc::format;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use core::cell::Ref;
use core::cell::RefCell;
use core::ffi::c_char;
use core::ffi::c_int;
use core::ffi::c_void;
use core::mem::forget;
use num_traits::ToPrimitive;
use sqlite::sqlite3;
use sqlite_nostd as sqlite;
use sqlite_nostd::Connection;
use sqlite_nostd::ManagedStmt;
use sqlite_nostd::ResultCode;
use sqlite_nostd::Stmt;
use sqlite_nostd::StrRef;

pub struct TableInfo {
    pub tbl_name: String,
    pub pks: Vec<ColumnInfo>,
    pub non_pks: Vec<ColumnInfo>,

    set_winner_clock_stmt: RefCell<Option<ManagedStmt>>,
    local_cl_stmt: RefCell<Option<ManagedStmt>>,
    col_version_stmt: RefCell<Option<ManagedStmt>>,
    merge_pk_only_insert_stmt: RefCell<Option<ManagedStmt>>,
    merge_delete_stmt: RefCell<Option<ManagedStmt>>,
    merge_delete_drop_clocks_stmt: RefCell<Option<ManagedStmt>>,
    zero_clocks_on_resurrect_stmt: Option<ManagedStmt>,
    // put statement cache here, remove btreemap based cache.
}

impl TableInfo {
    fn find_non_pk_col(&self, col_name: &str) -> Result<&ColumnInfo, ResultCode> {
        for col in &self.non_pks {
            if col.name == col_name {
                return Ok(col);
            }
        }
        Err(ResultCode::ERROR)
    }

    pub fn get_set_winner_clock_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.set_winner_clock_stmt.try_borrow()?.is_none() {
            let sql = format!(
              "INSERT OR REPLACE INTO \"{table_name}__crsql_clock\"
              ({pk_ident_list}, __crsql_col_name, __crsql_col_version, __crsql_db_version, __crsql_seq, __crsql_site_id)
              VALUES (
                {pk_bind_list},
                ?,
                ?,
                crsql_next_db_version(?),
                ?,
                ?
              ) RETURNING _rowid_",
              table_name = crate::util::escape_ident(&self.tbl_name),
              pk_ident_list = crate::util::as_identifier_list(&self.pks, None)?,
              pk_bind_list = crate::util::binding_list(self.pks.len()),
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.set_winner_clock_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.set_winner_clock_stmt.try_borrow()?)
    }

    pub fn get_local_cl_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.local_cl_stmt.try_borrow()?.is_none() {
            // prepare it
            let sql = format!(
              "SELECT COALESCE(
                (SELECT __crsql_col_version FROM \"{table_name}__crsql_clock\" WHERE {pk_where_list} AND __crsql_col_name = '{delete_sentinel}'),
                (SELECT 1 FROM \"{table_name}__crsql_clock\" WHERE {pk_where_list})
              )",
              table_name = crate::util::escape_ident(&self.tbl_name),
              pk_where_list = crate::util::where_list(&self.pks, None)?,
              delete_sentinel = crate::c::DELETE_SENTINEL,
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.local_cl_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.local_cl_stmt.try_borrow()?)
    }

    pub fn get_col_version_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.col_version_stmt.try_borrow()?.is_none() {
            let sql = format!(
              "SELECT __crsql_col_version FROM \"{table_name}__crsql_clock\" WHERE {pk_where_list} AND ? = __crsql_col_name",
              table_name = crate::util::escape_ident(&self.tbl_name),
              pk_where_list = crate::util::where_list(&self.pks, None)?,
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.col_version_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.col_version_stmt.try_borrow()?)
    }

    pub fn get_merge_pk_only_insert_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.merge_pk_only_insert_stmt.try_borrow()?.is_none() {
            let sql = format!(
                "INSERT OR IGNORE INTO \"{table_name}\" ({pk_idents}) VALUES ({pk_bindings})",
                table_name = crate::util::escape_ident(&self.tbl_name),
                pk_idents = crate::util::as_identifier_list(&self.pks, None)?,
                pk_bindings = crate::util::binding_list(self.pks.len()),
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.merge_pk_only_insert_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.merge_pk_only_insert_stmt.try_borrow()?)
    }

    pub fn get_merge_delete_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.merge_delete_stmt.try_borrow()?.is_none() {
            let sql = format!(
                "DELETE FROM \"{table_name}\" WHERE {pk_where_list}",
                table_name = crate::util::escape_ident(&self.tbl_name),
                pk_where_list = crate::util::where_list(&self.pks, None)?,
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.merge_delete_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.merge_delete_stmt.try_borrow()?)
    }

    pub fn get_merge_delete_drop_clocks_stmt(
        &self,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.merge_delete_drop_clocks_stmt.try_borrow()?.is_none() {
            let sql = format!(
              "DELETE FROM \"{table_name}__crsql_clock\" WHERE {pk_where_list} AND __crsql_col_name IS NOT '{sentinel}'",
              table_name = crate::util::escape_ident(&self.tbl_name),
              pk_where_list = crate::util::where_list(&self.pks, None)?,
              sentinel = crate::c::DELETE_SENTINEL
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.merge_delete_drop_clocks_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.merge_delete_drop_clocks_stmt.try_borrow()?)
    }

    pub fn get_col_value_stmt(
        &self,
        db: *mut sqlite3,
        col_name: &str,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        let col_info = self.find_non_pk_col(col_name)?;
        col_info.get_curr_value_stmt(self, db)
    }

    pub fn clear_stmts(&self) -> Result<ResultCode, ResultCode> {
        // finalize all stmts
        let mut stmt = self.set_winner_clock_stmt.try_borrow_mut()?;
        stmt.take();
        let mut stmt = self.local_cl_stmt.try_borrow_mut()?;
        stmt.take();
        let mut stmt = self.col_version_stmt.try_borrow_mut()?;
        stmt.take();
        let mut stmt = self.merge_pk_only_insert_stmt.try_borrow_mut()?;
        stmt.take();
        let mut stmt = self.merge_delete_stmt.try_borrow_mut()?;
        stmt.take();
        let mut stmt = self.merge_delete_drop_clocks_stmt.try_borrow_mut()?;
        stmt.take();

        // primary key columns shouldn't have statements? right?
        for col in &self.non_pks {
            col.clear_stmts()?;
        }

        Ok(ResultCode::OK)
    }
}

pub struct ColumnInfo {
    pub cid: i32,
    pub name: String,
    // > 0 if it is a primary key columns
    // the value refers to the position in the `PRIMARY KEY (cols...)` statement
    pub pk: i32,
    curr_value_stmt: RefCell<Option<ManagedStmt>>,
    merge_insert_stmt: Option<ManagedStmt>,
    row_patch_data_stmt: Option<ManagedStmt>,
}

impl ColumnInfo {
    fn get_curr_value_stmt(
        &self,
        tbl_info: &TableInfo,
        db: *mut sqlite3,
    ) -> Result<Ref<Option<ManagedStmt>>, ResultCode> {
        if self.curr_value_stmt.try_borrow()?.is_none() {
            let sql = format!(
                "SELECT \"{col_name}\" FROM \"{table_name}\" WHERE {pk_where_list}",
                col_name = crate::util::escape_ident(&self.name),
                table_name = crate::util::escape_ident(&tbl_info.tbl_name),
                pk_where_list = crate::util::where_list(&tbl_info.pks, None)?,
            );
            let ret = db.prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            *self.curr_value_stmt.try_borrow_mut()? = Some(ret);
        }
        Ok(self.curr_value_stmt.try_borrow()?)
    }

    pub fn clear_stmts(&self) -> Result<ResultCode, ResultCode> {
        let mut stmt = self.curr_value_stmt.try_borrow_mut()?;
        stmt.take();

        Ok(ResultCode::OK)
    }
}

#[no_mangle]
pub extern "C" fn crsql_init_table_info_vec(ext_data: *mut crsql_ExtData) {
    let vec: Vec<TableInfo> = vec![];
    unsafe { (*ext_data).tableInfos = Box::into_raw(Box::new(vec)) as *mut c_void }
}

#[no_mangle]
pub extern "C" fn crsql_drop_table_info_vec(ext_data: *mut crsql_ExtData) {
    unsafe {
        drop(Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>));
    }
}

#[no_mangle]
pub extern "C" fn crsql_ensure_table_infos_are_up_to_date(
    db: *mut sqlite::sqlite3,
    ext_data: *mut crsql_ExtData,
    err: *mut *mut c_char,
) -> c_int {
    let schema_changed =
        unsafe { crsql_fetchPragmaSchemaVersion(db, ext_data, TABLE_INFO_SCHEMA_VERSION) };

    if schema_changed < 0 {
        return ResultCode::ERROR as c_int;
    }

    let mut table_infos = unsafe { Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>) };

    if schema_changed > 0 || table_infos.len() == 0 {
        match pull_all_table_infos(db, ext_data, err) {
            Ok(new_table_infos) => {
                *table_infos = new_table_infos;
                forget(table_infos);
                return ResultCode::OK as c_int;
            }
            Err(e) => {
                forget(table_infos);
                return e as c_int;
            }
        }
    }

    forget(table_infos);
    return ResultCode::OK as c_int;
}

fn pull_all_table_infos(
    db: *mut sqlite::sqlite3,
    ext_data: *mut crsql_ExtData,
    err: *mut *mut c_char,
) -> Result<Vec<TableInfo>, ResultCode> {
    let mut clock_table_names = vec![];
    let stmt = unsafe { (*ext_data).pSelectClockTablesStmt };
    loop {
        match stmt.step() {
            Ok(ResultCode::ROW) => {
                clock_table_names.push(stmt.column_text(0).to_string());
            }
            Ok(ResultCode::DONE) => {
                stmt.reset()?;
                break;
            }
            Ok(rc) | Err(rc) => {
                stmt.reset()?;
                return Err(rc);
            }
        }
    }

    let mut ret = vec![];
    for name in clock_table_names {
        ret.push(pull_table_info(
            db,
            &name[0..(name.len() - "__crsql_clock".len())],
            err,
        )?)
    }

    Ok(ret)
}

/**
 * Given a table name, return the table info that describes that table.
 * TableInfo is a struct that represents the results
 * of pragma_table_info, pragma_index_list, pragma_index_info on a given table
 * and its indices as well as some extra fields to facilitate crr creation.
 */
pub fn pull_table_info(
    db: *mut sqlite::sqlite3,
    table: &str,
    err: *mut *mut c_char,
) -> Result<TableInfo, ResultCode> {
    let sql = format!("SELECT count(*) FROM pragma_table_info('{table}')");
    let columns_len = match db.prepare_v2(&sql).and_then(|stmt| {
        stmt.step()?;
        stmt.column_int(0).to_usize().ok_or(ResultCode::ERROR)
    }) {
        Ok(count) => count,
        Err(code) => {
            err.set(&format!("Failed to find columns for crr -- {table}"));
            return Err(code);
        }
    };

    let sql = format!(
        "SELECT \"cid\", \"name\", \"pk\"
         FROM pragma_table_info('{table}') ORDER BY cid ASC"
    );
    let column_infos = match db.prepare_v2(&sql) {
        Ok(stmt) => {
            let mut cols: Vec<ColumnInfo> = vec![];

            while stmt.step()? == ResultCode::ROW {
                cols.push(ColumnInfo {
                    name: stmt.column_text(1)?.to_string(),
                    cid: stmt.column_int(0),
                    pk: stmt.column_int(2),
                    curr_value_stmt: RefCell::new(None),
                    merge_insert_stmt: None,
                    row_patch_data_stmt: None,
                });
            }

            if cols.len() != columns_len {
                err.set("Number of fetched columns did not match expected number of columns");
                return Err(ResultCode::ERROR);
            }
            cols
        }
        Err(code) => {
            err.set(&format!("Failed to prepare select for crr -- {table}"));
            return Err(code);
        }
    };

    let (mut pks, non_pks): (Vec<_>, Vec<_>) = column_infos.into_iter().partition(|x| x.pk > 0);
    pks.sort_by_key(|x| x.pk);

    return Ok(TableInfo {
        tbl_name: table.to_string(),
        pks,
        non_pks,
        set_winner_clock_stmt: RefCell::new(None),
        local_cl_stmt: RefCell::new(None),
        col_version_stmt: RefCell::new(None),
        merge_pk_only_insert_stmt: RefCell::new(None),
        merge_delete_stmt: RefCell::new(None),
        merge_delete_drop_clocks_stmt: RefCell::new(None),
        zero_clocks_on_resurrect_stmt: None,
    });
}

pub fn is_table_compatible(
    db: *mut sqlite::sqlite3,
    table: &str,
    err: *mut *mut c_char,
) -> Result<bool, ResultCode> {
    // No unique indices besides primary key
    if db.count(&format!(
        "SELECT count(*) FROM pragma_index_list('{table}')
            WHERE \"origin\" != 'pk' AND \"unique\" = 1"
    ))? != 0
    {
        err.set(&format!(
            "Table {table} has unique indices besides\
                        the primary key. This is not allowed for CRRs"
        ));
        return Ok(false);
    }

    // Must have a primary key
    if db.count(&format!(
        // pragma_index_list does not include primary keys that alias rowid...
        // hence why we cannot use
        // `select * from pragma_index_list where origin = pk`
        "SELECT count(*) FROM pragma_table_info('{table}')
        WHERE \"pk\" > 0"
    ))? == 0
    {
        err.set(&format!(
            "Table {table} has no primary key. \
            CRRs must have a primary key"
        ));
        return Ok(false);
    }

    // No auto-increment primary keys
    let stmt = db.prepare_v2(&format!(
        "SELECT 1 FROM sqlite_master WHERE name = ? AND type = 'table' AND sql
            LIKE '%autoincrement%' limit 1"
    ))?;
    stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
    if stmt.step()? == ResultCode::ROW {
        err.set(&format!(
            "{table} has auto-increment primary keys. This is likely a mistake as two \
                concurrent nodes will assign unrelated rows the same primary key. \
                Either use a primary key that represents the identity of your row or \
                use a database friendly UUID such as UUIDv7"
        ));
        return Ok(false);
    };

    // No checked foreign key constraints
    if db.count(&format!(
        "SELECT count(*) FROM pragma_foreign_key_list('{table}')"
    ))? != 0
    {
        err.set(&format!(
            "Table {table} has checked foreign key constraints. \
            CRRs may have foreign keys but must not have \
            checked foreign key constraints as they can be violated \
            by row level security or replication."
        ));
        return Ok(false);
    }

    // Check for default value or nullable
    if db.count(&format!(
        "SELECT count(*) FROM pragma_table_xinfo('{table}')
        WHERE \"notnull\" = 1 AND \"dflt_value\" IS NULL AND \"pk\" = 0"
    ))? != 0
    {
        err.set(&format!(
            "Table {table} has a NOT NULL column without a DEFAULT VALUE. \
            This is not allowed as it prevents forwards and backwards \
            compatibility between schema versions. Make the column \
            nullable or assign a default value to it."
        ));
        return Ok(false);
    }

    return Ok(true);
}
