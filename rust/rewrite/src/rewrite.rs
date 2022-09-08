use crate::parse::parse;

pub fn rewrite(query: &str) -> Result<String, &'static str> {
  let parsed = parse(query).unwrap();

  match parsed {
    None => Ok(query.to_string()),
    Some(_ast) => ast_to_crr_stmts(query),
  }
}

fn ast_to_crr_stmts(query: &str) -> Result<String, &'static str> {
  return Ok("".to_string());
}
