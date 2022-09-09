use sqlite3_parser::ast::Stmt;

use crate::ast::{to_string, wrap_for_display, NameExt, QualifiedNameExt};
use crate::parse::parse;
use crate::sql_bits::{if_exists_str, ifne_str, meta_query, unique_str};
use crate::tables::{create_alter_crr_tbl_stmts, create_crr_clock_tbl_stmt, create_crr_tbl_stmt};
use crate::triggers::{
  create_delete_trig, create_insert_trig, create_patch_trig, create_update_trig,
};
use crate::views::{create_patch_view_stmt, create_view_stmt};

/**
 * rewrites the provided crr query to a standard sql query.
 *
 * If the provided query is already standard sql, the original input is returned.
 *
 * If the provided query is a crr statement, the standard sql required to construct the base crr table(s) is returned.
 * A meta-query is also optionally returned.
 *
 * If present, this meta-query needs to be issued against the database and
 * supporting table structures must be created based on the results of the meta query.
 *
 * If not present, crr creation is complete.
 *
 * Example usage:
 *
 * ```typescript
 * // do everything in a transaction so we don't end up in an inconsistent state
 * sqlite_connection.in_transaction(() => {
 *   // re-write our query to standard sql
 *   let [query, meta_query] = cfsqlite.rewrite(query)
 *   // run the re-written query
 *   sqlite_connection.execute(query)
 *   // if a meta query was returned, do additional crr work
 *   if (meta_query) {
 *     metadata = sqlite_connection.all(query)
 *     sqlite_connection.execute(cfsqlite.support_statements(metadata))
 *   }
 * })
 * ```
 */
pub fn rewrite(query: &str) -> Result<(String, Option<String>), &'static str> {
  let parsed = parse(query).unwrap();

  match parsed {
    None => Ok((query.to_string(), None)),
    Some(ast) => ast_to_crr_stmt(ast),
  }
}

/**
 * Gathers statements required to create supporting structure that goes along with a conflict free
 * table (a crr).
 *
 * The input to this function is the result of the meta query that was returned by `rewrite`
 *
 * The output is a set of sql statements that should be run in a transaction with the re-written sql.
 *
 * See the example on the `rewrite` function.
 */
pub fn support_statements(meta_query_result: &str) -> String {
  // todo: normalize the able name before parsing?
  // the meta query result should only ever be the crr create table statement
  let ast = parse(meta_query_result).unwrap().unwrap();
  match &ast {
    Stmt::CreateTable {
      temporary,
      if_not_exists,
      tbl_name,
      body,
    } => vec![
      create_crr_clock_tbl_stmt(temporary, &true, tbl_name),
      create_view_stmt(temporary, if_not_exists, tbl_name, body),
      create_patch_view_stmt(temporary, if_not_exists, tbl_name),
      create_insert_trig(),
      create_update_trig(),
      create_delete_trig(),
      create_patch_trig(),
    ]
    .join(";\n"),
    _ => unreachable!(),
  }
}

fn ast_to_crr_stmt(ast: Stmt) -> Result<(String, Option<String>), &'static str> {
  match &ast {
    Stmt::CreateTable { tbl_name, .. } => Ok((
      rewrite_create_table(&ast),
      Some(meta_query(tbl_name.to_crr_table_ident())),
    )),
    Stmt::AlterTable(tbl_name, ..) => Ok((
      rewrite_alter(&ast),
      Some(meta_query(tbl_name.to_crr_table_ident())),
    )),
    Stmt::CreateIndex { .. } => Ok((rewrite_create_index(&ast), None)),
    Stmt::DropIndex { .. } => Ok((rewrite_drop_index(&ast), None)),
    Stmt::DropTable { .. } => Ok((rewrite_drop_table(&ast), None)),
    _ => Err("Received an unexpected crr statement"),
  }
}

// TODO: throw on missing primary key
fn rewrite_create_table(ast: &Stmt) -> String {
  match &ast {
    Stmt::CreateTable {
      temporary,
      if_not_exists,
      tbl_name,
      body,
    } => create_crr_tbl_stmt(temporary, if_not_exists, tbl_name, body),
    _ => unreachable!(),
  }
}

/**
 * Creates the index against the crr table rather than view / non-crr
 */
fn rewrite_create_index(ast: &Stmt) -> String {
  match &ast {
    Stmt::CreateIndex {
      unique,
      if_not_exists,
      idx_name,
      tbl_name,
      columns,
      where_clause,
    } => format!(
      "CREATE {unique} INDEX {if_not_exists} {idx_name} ON {tbl_name} ({columns}) {where_clause}",
      unique = unique_str(unique),
      if_not_exists = ifne_str(if_not_exists),
      idx_name = idx_name.to_ident(),
      tbl_name = tbl_name.to_crr_table_ident(),
      columns = columns
        .iter()
        .map(|x| to_string(x))
        .collect::<Vec<_>>()
        .join(","),
      where_clause = match where_clause {
        None => "".to_string(),
        Some(clause) => to_string(clause),
      }
    ),
    _ => unreachable!(),
  }
}

/**
 * Drops the:
 * - view against the crr table
 * - the crr table
 * - the crr clock table
 */
fn rewrite_drop_table(ast: &Stmt) -> String {
  match &ast {
    Stmt::DropTable {
      if_exists,
      tbl_name,
    } => vec![
      format!(
        "DROP VIEW {if_exists} {tbl_name}",
        if_exists = if_exists_str(if_exists),
        tbl_name = tbl_name.to_view_ident()
      ),
      format!(
        "DROP TABLE {if_exists} {tbl_name}",
        if_exists = if_exists_str(if_exists),
        tbl_name = tbl_name.to_crr_table_ident()
      ),
      format!(
        "DROP TABLE {if_exists} {tbl_name}",
        if_exists = if_exists_str(if_exists),
        tbl_name = tbl_name.to_crr_clock_table_ident()
      ),
    ]
    .join(";\n"),
    _ => unreachable!(),
  }
}

/**
 * Drops the index against the crr table
 */
fn rewrite_drop_index(ast: &Stmt) -> String {
  match &ast {
    Stmt::DropIndex {
      if_exists,
      idx_name,
    } => format!(
      "DROP INDEX {if_exists} {idx_name}",
      if_exists = if_exists_str(if_exists),
      idx_name = wrap_for_display(idx_name)
    ),
    _ => unreachable!(),
  }
}

/**
 * Drops views, creates alter statement that targets the crr table.
 * Caller constructs a meta-query to use to fetch data to recreate
 * views and triggers.
 */
fn rewrite_alter(ast: &Stmt) -> String {
  match ast {
    // where can we get the full def from?
    // a pointer to a connection would have to be provided...
    Stmt::AlterTable(name, body) => vec![
      format!("DROP VIEW IF EXISTS {}", name.to_view_ident()),
      format!("DROP VIEW IF EXISTS {}", name.to_patch_view_ident()),
      create_alter_crr_tbl_stmts(name, body),
    ]
    .join(";\n"),
    _ => unreachable!(),
  }
}

#[cfg(test)]
mod tests {
  // test out `ToTokens` to see if we can easily stringify a where clause or some such thing

  use crate::{ast::WrapForDisplay, parse};

  #[test]
  fn explore() {
    let sql = "CREATE CRR INDEX \"foo\" ON \"bar\" (\"a\", \"b\") WHERE \"a\" > 1";
    let ast = parse(sql).unwrap().unwrap();

    println!("{}", WrapForDisplay { val: ast });
  }
}
