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
    let cases = vec![
      ("foo", vec!["foo"]),
      ("foo;", vec!["foo"]),
      ("foo;bar", vec!["foo", "bar"]),
      ("foo; bar", vec!["foo", "bar"])
    ];


    for case in cases {
      let parsed = sql_parser::statements(case[0]);
      assert_eq!(parsed, Ok(case[1]));
    }
  }
}
