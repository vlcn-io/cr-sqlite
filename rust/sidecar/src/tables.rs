use sqlite3_parser::ast::{AlterTableBody, ColumnDefinition, CreateTableBody, QualifiedName};

use crate::{
  ast::{wrap_for_display, QualifiedNameExt},
  sql_bits::{ifne_str, table_opts_str, temp_str},
};

pub fn create_crr_tbl_stmt(
  temporary: &bool,
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!(
    "CREATE {temporary} TABLE {if_not_exists} {tbl_name} {body_def}",
    temporary = temp_str(temporary),
    if_not_exists = ifne_str(if_not_exists),
    tbl_name = tbl_name.to_crr_table_ident(),
    body_def = create_body_def(body).unwrap()
  )
}

fn create_body_def(body: &CreateTableBody) -> Result<String, &'static str> {
  match body {
    CreateTableBody::ColumnsAndConstraints {
      columns,
      constraints,
      options,
    } => Ok(format!(
      "({column_and_constraint_list}) {table_options}",
      // add version columns, causal length and update src
      // validate constraints (e.g., too many unique keys)
      column_and_constraint_list = vec![""].join(",\n"),
      table_options = table_opts_str(options)
    )),
    CreateTableBody::AsSelect(_) => {
      Err("table creation from select statements is not yet supported for crrs")
    }
  }
}

fn to_crr_columns(columns: &Vec<ColumnDefinition>) -> Vec<String> {
  // iterate thru cols,
  // add version cols
  // convert cols to idents
  // add cl col
  // add update src col
  vec![]
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

pub fn create_alter_crr_tbl_stmt(body: &AlterTableBody) -> String {
  // branches:
  // rename table
  // rename col
  // add col
  // drop col
  // --
  // rename table -> rename crr
  // rename col -> std but crr tbl + version col
  // add col -> std but crr tbl + version col
  // drop col -> std but crr tbl + drop version col
  format!("ALTER TABLE")
}
