/*
 * We only care about parsing:
 * - `CREATE CRR crr-table-name` -- https://sqlite.org/lang_createtable.html
 * - `ALTER CRR crr-table-name` -- https://www.sqlite.org/lang_altertable.html
 * - `CREATE CRR INDEX ... ON crr-table-name` -- https://www.sqlite.org/lang_createindex.html
 *
 * For the MVP we'll be dumb and:
 * 1. Regex for any of the above 3 prefixes as a prefix of the input. Note: this means we can only process 1 statement per connection!
 * 2. Strip CRR from the prefix
 * 3. Run through parser
 * 4. Run create/migration logic
 *
 * Note: see notes.md
 */
use fallible_iterator::FallibleIterator;
use lazy_static::lazy_static;
use regex::{Regex, RegexBuilder};
use sqlite3_parser::ast::Cmd::{Explain, ExplainQueryPlan, Stmt as StmtVar};
use sqlite3_parser::ast::Stmt;
use sqlite3_parser::lexer::sql::Parser;
use substring::Substring;

lazy_static! {
  static ref RE: Regex = RegexBuilder::new(r"^(?P<create>CREATE\s+CRR)|(?P<alter>ALTER\s+CRR)")
    .case_insensitive(true)
    .build()
    .unwrap();
}

fn is_crr_stmt(query: &str) -> bool {
  match RE.find(query) {
    None => false,
    Some(_) => true,
  }
}

fn convert_crr_stmt_to_sql(query: &str) -> Result<String, &'static str> {
  let caps = RE.captures(query).unwrap();

  let create = caps.name("create");
  let alter = caps.name("alter");

  let crr_type = create.or(alter);

  match crr_type {
    Some(m) => Ok(
      query.substring(0, m.range().end - 3).to_string()
        + query.substring(m.range().end, query.len()),
    ),
    _ => Err("CRR statement could not be converted to SQL"),
  }
}

pub fn parse(query: &str) -> Result<Option<Stmt>, &'static str> {
  if is_crr_stmt(query) {
    let sql = convert_crr_stmt_to_sql(query).expect("Unable to convert CRR string to SQL string");

    let mut parser = Parser::new(sql.as_bytes());
    let stmt = parser.next();

    match parser.next() {
      Ok(None) => {}
      Err(_) => {}
      Ok(_) => {
        // TODO support many statements
        return Err("CRR layer currently only supports running a single statement at a time");
      }
    }

    match stmt {
      Ok(Some(cmd)) => match cmd {
        Explain(_) => Err("Got an unexpected `explain` statement in CRR parsing"),
        ExplainQueryPlan(_) => {
          Err("Got an unexpected `explain_query_plan` statement in CRR parsing")
        }
        StmtVar(stmt) => Ok(Some(stmt)),
      },
      Ok(None) => Err("The CRR statement parsed to an empty command"),
      Err(_) => Err("Failed to parse the SQL statement"),
    }
  } else {
    Ok(None)
  }
}

#[cfg(test)]
mod tests {
  use crate::{convert_crr_stmt_to_sql, is_crr_stmt, parse};
  use sqlite3_parser::ast::{ColumnDefinition, Name, Stmt, TableOptions};

  #[test]
  fn ignore_non_crr_stmts() {
    let arg = "CREATE TABLE foo (a, b, c);";

    // Non-crr statements do not get parsed by us -- just return a none result
    assert_eq!(parse(arg), Ok(None));

    let arg = "ALTER TABLE foo RENAME TO bar;";
    assert_eq!(parse(arg), Ok(None));
  }

  #[test]
  fn crr_stmts_are_parsed() {
    let parsed = parse("CREATE CRR TABLE foo (a);").unwrap();

    assert_eq!(
      parsed,
      Some(Stmt::CreateTable {
        temporary: false,
        if_not_exists: false,
        tbl_name: sqlite3_parser::ast::QualifiedName {
          db_name: None,
          name: Name("foo".to_string()),
          alias: None
        },
        body: sqlite3_parser::ast::CreateTableBody::ColumnsAndConstraints {
          columns: vec![ColumnDefinition {
            col_name: Name("a".to_string()),
            col_type: None,
            constraints: vec![],
          }],
          constraints: None,
          options: TableOptions::NONE
        }
      })
    )
  }

  #[test]
  fn test_is_crr_stmt() {
    assert_eq!(is_crr_stmt("CREATE CRR"), true);
    assert_eq!(is_crr_stmt("CREATE CRR INDEX"), true);
    assert_eq!(is_crr_stmt("ALTER CRR"), true);
    assert_eq!(
      is_crr_stmt(
        "ALTER
    CRR"
      ),
      true
    );
    assert_eq!(
      is_crr_stmt(
        "CREATE
CRR
INDEX"
      ),
      true
    );
    assert_eq!(is_crr_stmt("CREATE TABLE"), false);
    assert_eq!(is_crr_stmt("ALTER TABLE"), false);
    assert_eq!(is_crr_stmt("CREATE UNIQUE INDEX"), false);
  }

  #[test]
  fn test_convert_crr_stmt_to_sql() {
    assert_eq!(
      convert_crr_stmt_to_sql("CREATE CRR TABLE foo (a, b)").unwrap(),
      "CREATE  TABLE foo (a, b)"
    );
    assert_eq!(
      convert_crr_stmt_to_sql("create crr table foo (a, b)").unwrap(),
      "create  table foo (a, b)"
    );
    assert_eq!(
      convert_crr_stmt_to_sql("create crr unique index bar on foo (a)").unwrap(),
      "create  unique index bar on foo (a)"
    );
    assert_eq!(
      convert_crr_stmt_to_sql("alter crr table foo").unwrap(),
      "alter  table foo"
    );
  }
}
