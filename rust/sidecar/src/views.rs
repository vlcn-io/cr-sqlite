use crate::{
  ast::{CreateTableBodyExt, NameExt, QualifiedNameExt},
  sql_bits::{ifne_str, temp_str},
};
use sqlite3_parser::ast::{CreateTableBody, QualifiedName};

/**
 * Takes in a crr or non crr table definition and creates the corresponding view.
 */
pub fn create_view_stmt(
  temporary: &bool,
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  // TODO: select `rowid` if no pk?
  format!(
    "CREATE {temporary} VIEW
      {if_not_exists} {tbl_name} AS SELECT
        {column_list}
      FROM
        {crr_tbl_name}
      WHERE
        {crr_tbl_name}.\"crr_cl\" % 2 = 1",
    temporary = temp_str(temporary),
    if_not_exists = ifne_str(if_not_exists),
    tbl_name = tbl_name.to_view_ident(),
    column_list = body
      .non_crr_columns()
      .unwrap()
      .iter()
      .map(|x| x.col_name.to_ident())
      .collect::<Vec<_>>()
      .join(",\n"),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
  )
}

pub fn create_patch_view_stmt(
  temporary: &bool,
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
) -> String {
  format!(
    "CREATE {temporary} VIEW
      {if_not_exists} {tbl_name} AS SELECT
        {crr_tbl_name}.*,
        '{{\"fake\": 1}}' as crr_clock
      FROM {crr_tbl_name}",
    temporary = temp_str(temporary),
    if_not_exists = ifne_str(if_not_exists),
    tbl_name = tbl_name.to_patch_view_ident(),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
  )
}
