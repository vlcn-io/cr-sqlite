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

fn is_crr_statement(query: &str) -> bool {
  lazy_static! {
    static ref RE: Regex = RegexBuilder::new(r"^CREATE CRR|ALTER CRR")
      .case_insensitive(true)
      .build()
      .unwrap();
  }

  match RE.find(query) {
    None => false,
    Some(_) => true,
  }
}

pub fn parse(query: &str) -> Result<Option<Stmt>, &'static str> {
  if is_crr_statement(query) {
    // TODO: strip CRR keyword
    let mut parser = Parser::new(query.as_bytes());
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
  use crate::parse;

  #[test]
  fn ignore_non_crr_stmts() {
    let arg = "CREATE TABLE foo (a, b, c);";

    // Non crr statements do not get parsed by us -- just return a none result
    assert_eq!(parse(arg), Ok(None));

    let arg = "ALTER TABLE foo RENAME TO bar;";
    assert_eq!(parse(arg), Ok(None));
  }

  #[test]
  fn parse_crr_stmts() {}
}
