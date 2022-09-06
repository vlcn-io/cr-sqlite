peg::parser!{
  grammar sql_parser() for str {
    #[cache_left_rec]
    pub rule statements() -> Vec<String>
      = l:statements() _ ";" _ r:statement() { l.into_iter().chain(vec![r].into_iter()).collect() }
      / s:statement() { vec![s] }
    

    rule statement() -> String
      = s:$(['a'..='z']+) { s.parse().unwrap() }
    
    rule _() = quiet!{[' ' | '\n' | '\t']*}
  }
}

#[cfg(test)]
mod tests {
  use crate::sql_parser;

  #[test]
  fn it_works() {
    let parsed = sql_parser::statements("foo; bar");
    println!("{:?}", parsed);
    // assert_eq!(parsed, Ok(vec!["foo", "bar"]));
  }
}
