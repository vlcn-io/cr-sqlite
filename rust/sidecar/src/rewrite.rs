use sqlite3_parser::ast::{CreateTableBody, QualifiedName, Stmt};

use crate::ast::QualifiedNameExt;
use crate::parse::parse;

pub fn rewrite(query: &str) -> Result<String, &'static str> {
  let parsed = parse(query).unwrap();

  match parsed {
    None => Ok(query.to_string()),
    Some(ast) => ast_to_crr_stmts(ast),
  }
}

fn ast_to_crr_stmts(ast: Stmt) -> Result<String, &'static str> {
  match ast {
    Stmt::AlterTable(..) => Ok(rewrite_alter(ast).join(";\n")),
    Stmt::CreateTable { .. } => Ok(rewrite_create_table(ast).join(";\n")),
    Stmt::CreateIndex { .. } => Ok(rewrite_create_index(ast)),
    _ => Err("Received an unexpected crr statement"),
  }
}

// enum variants can't be specified as types yet: https://github.com/rust-lang/lang-team/issues/122
fn rewrite_alter(ast: Stmt) -> Vec<String> {
  match ast {
    // drop:
    // views, triggers
    // alter:
    // crr table
    // create:
    // views, triggers
    Stmt::AlterTable(name, body) => vec![
      "BEGIN".to_string(),
      format!("DROP VIEW IF EXISTS {}", name.to_view_ident()),
      format!("DROP VIEW IF EXISTS {}", name.to_patch_view_ident()),
      create_alter_crr_tbl_stmt(),
      create_view_stmt(),
      create_patch_view_stmt(),
      create_insert_trig(),
      create_update_trig(),
      create_delete_trig(),
      create_patch_trig(),
      "COMMIT".to_string(),
    ],
    _ => unreachable!(),
  }
}

fn rewrite_create_table(ast: Stmt) -> Vec<String> {
  match ast {
    Stmt::CreateTable {
      temporary,
      if_not_exists,
      tbl_name,
      body,
    } => {
      vec![
        "BEGIN".to_string(),
        create_crr_tbl_stmt(temporary, if_not_exists, tbl_name, body),
        create_crr_clock_tbl_stmt(),
        create_view_stmt(),
        create_patch_view_stmt(),
        create_insert_trig(),
        create_update_trig(),
        create_delete_trig(),
        create_patch_trig(),
        "COMMIT".to_string(),
      ]
    }
    _ => unreachable!(),
  }
}

fn create_crr_tbl_stmt(
  temporary: bool,
  if_not_exists: bool,
  tbl_name: QualifiedName,
  body: CreateTableBody,
) -> String {
  format!(
    "CREATE {temp_str} TABLE {ifne_str} {tbl_name_str} {}",
    temp_str = if temporary { "TEMPORARY" } else { "" },
    ifne_str = if if_not_exists { "IF NOT EXISTS" } else { "" },
    tbl_name_str = tbl_name.to_view_ident(),
  )
}

fn rewrite_create_index(ast: Stmt) -> Vec<String> {
  return vec![];
}

// TODO: handle drop index!
