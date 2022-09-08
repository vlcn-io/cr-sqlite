use sqlite3_parser::ast::{CreateTableBody, QualifiedName, Stmt};

use crate::ast::QualifiedNameExt;
use crate::parse::parse;
use crate::tables::{create_crr_clock_tbl_stmt, create_crr_tbl_stmt};
use crate::views::{create_patch_view_stmt, create_view_stmt};

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
      "SAVEPOINT cfsql_crr_alter".to_string(),
      format!("DROP VIEW IF EXISTS {}", name.to_view_ident()),
      format!("DROP VIEW IF EXISTS {}", name.to_patch_view_ident()),
      create_alter_crr_tbl_stmt(),
      create_view_stmt(false, false, name, body),
      create_patch_view_stmt(false, false, name),
      create_insert_trig(),
      create_update_trig(),
      create_delete_trig(),
      create_patch_trig(),
      "RELEASE cfsql_crr_alter".to_string(),
    ],
    _ => unreachable!(),
  }
}

// TODO: throw on missing primary key
fn rewrite_create_table(ast: Stmt) -> Vec<String> {
  match ast {
    Stmt::CreateTable {
      temporary,
      if_not_exists,
      tbl_name,
      body,
    } => {
      vec![
        "SAVEPOINT cfsql_crr_alter".to_string(),
        create_crr_tbl_stmt(temporary, if_not_exists, tbl_name, body),
        create_crr_clock_tbl_stmt(temporary, if_not_exists, tbl_name),
        create_view_stmt(temporary, if_not_exists, tbl_name, body),
        create_patch_view_stmt(temporary, if_not_exists, tbl_name),
        create_insert_trig(),
        create_update_trig(),
        create_delete_trig(),
        create_patch_trig(),
        "RELEASE cfsql_crr_alter".to_string(),
      ]
    }
    _ => unreachable!(),
  }
}

fn rewrite_create_index(ast: Stmt) -> Vec<String> {
  return vec![];
}

// TODO: handle drop index!
