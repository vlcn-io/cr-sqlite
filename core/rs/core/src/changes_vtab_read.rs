extern crate alloc;
use crate::{tableinfo::TableInfo, util};
use alloc::format;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use sqlite::ResultCode;

use sqlite_nostd as sqlite;

fn crsql_changes_query_for_table(table_info: &TableInfo) -> Result<String, ResultCode> {
    if table_info.pks.len() == 0 {
        // no primary keys? We can't get changes for a table w/o primary keys...
        // this should be an impossible case.
        return Err(ResultCode::ABORT);
    }

    let pk_list = crate::util::as_identifier_list(&table_info.pks, Some("t1."))?;
    // TODO: we can remove the self join if we put causal length in the primary key table
    let self_join = util::map_columns(&table_info.pks, |c| {
        format!("t1.\"{c}\" = t2.\"{c}\"", c = crate::util::escape_ident(c))
    })?
    .join(" AND ");

    // We LEFT JOIN and COALESCE the causal length
    // since we incorporated an optimization to not store causal length records
    // until they're required. I.e., do not store them until a delete
    // is actually issued. This cuts data weight quite a bit for
    // rows that never get removed.
    Ok(format!(
        "SELECT
          '{table_name_val}' as tbl,
          crsql_pack_columns({pk_list}) as pks,
          t1.__crsql_col_name as cid,
          t1.__crsql_col_version as col_vrsn,
          t1.__crsql_db_version as db_vrsn,
          t3.site_id as site_id,
          t1._rowid_,
          t1.__crsql_seq as seq,
          COALESCE(t2.__crsql_col_version, 1) as cl
      FROM \"{table_name_ident}__crsql_clock\" AS t1 LEFT JOIN \"{table_name_ident}__crsql_clock\" AS t2 ON
      {self_join} AND t2.__crsql_col_name = '{sentinel}' LEFT JOIN crsql_site_id as t3 ON t1.__crsql_site_id = t3.ordinal",
        table_name_val = crate::util::escape_ident_as_value(&table_info.tbl_name),
        pk_list = pk_list,
        table_name_ident = crate::util::escape_ident(&table_info.tbl_name),
        sentinel = crate::c::INSERT_SENTINEL,
        self_join = self_join
    ))
}

pub fn changes_union_query(
    table_infos: &Vec<TableInfo>,
    idx_str: &str,
) -> Result<String, ResultCode> {
    let mut sub_queries = vec![];

    for table_info in table_infos {
        let query_part = crsql_changes_query_for_table(&table_info)?;
        sub_queries.push(query_part);
    }

    // Manually null-terminate the string so we don't have to copy it to create a CString.
    // We can just extract the raw bytes of the Rust string.
    return Ok(format!(
      "SELECT tbl, pks, cid, col_vrsn, db_vrsn, site_id, _rowid_, seq, cl FROM ({unions}) {idx_str}\0",
      unions = sub_queries.join(" UNION ALL "),
      idx_str = idx_str,
    ));
}

pub fn row_patch_data_query(table_info: &TableInfo, col_name: &str) -> Option<String> {
    if let Ok(where_list) = crate::util::where_list(&table_info.pks, None) {
        return Some(format!(
            "SELECT \"{col_name}\" FROM \"{table_name}\" WHERE {where_list}\0",
            col_name = crate::util::escape_ident(col_name),
            table_name = crate::util::escape_ident(&table_info.tbl_name),
            where_list = where_list
        ));
    }

    return None;
}
