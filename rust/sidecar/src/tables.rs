use sqlite3_parser::ast::{CreateTableBody, QualifiedName};

use crate::{
  ast::QualifiedNameExt,
  sql_bits::{ifne_str, temp_str},
};

pub fn create_crr_tbl_stmt(
  temporary: &bool,
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!(
    "CREATE {temporary} TABLE {if_not_exists} {tbl_name}",
    temporary = temp_str(temporary),
    if_not_exists = ifne_str(if_not_exists),
    tbl_name = tbl_name.to_crr_table_ident(),
  )
}

pub fn create_crr_clock_tbl_stmt(
  temporary: &bool,
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
) -> String {
  format!(
    "CREATE {temporary} TABLE {ifne} {tbl_name} (
    \"id\" integer NOT NULL,
    \"siteId\" integer NOT NULL,
    \"version\" integer NOT NULL,
    PRIMARY KEY (\"siteId\", \"id\")
  )",
    temporary = temp_str(temporary),
    ifne = ifne_str(if_not_exists),
    tbl_name = tbl_name.to_crr_clock_table_ident(),
  )
}

pub fn create_alter_crr_tbl_stmt() -> String {
  format!("")
}
