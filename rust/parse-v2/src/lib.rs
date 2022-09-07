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
