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

#[cfg(test)]
mod tests {
  use fallible_iterator::FallibleIterator;
  use sqlite3_parser::lexer::sql::Parser;

  #[test]
  fn it_works() {
    let arg = "CREATE TABLE foo (a, b, c); CREATE TABLE bar (d, e, f);";
    let mut parser = Parser::new(arg.as_bytes());
    loop {
      match parser.next() {
        Ok(None) => break,
        Err(err) => {
          eprintln!("Err: {} in {}", err, arg);
          break;
        }
        Ok(Some(cmd)) => {
          println!("{}", cmd);
        }
      }
    }
  }
}
