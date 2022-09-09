use sqlite3_parser::ast::TableOptions;

pub fn ifne_str(if_not_exists: &bool) -> &'static str {
  if *if_not_exists {
    "IF NOT EXISTS"
  } else {
    ""
  }
}

pub fn if_exists_str(if_exists: &bool) -> &'static str {
  if *if_exists {
    "IF EXISTS"
  } else {
    ""
  }
}

pub fn temp_str(temporary: &bool) -> &'static str {
  if *temporary {
    "TEMPORARY"
  } else {
    ""
  }
}

pub fn unique_str(unique: &bool) -> &'static str {
  if *unique {
    "UNIQUE"
  } else {
    ""
  }
}

pub fn meta_query(tbl: String) -> String {
  format!(
    "SELECT sql FROM sqlite_schema WHERE type = 'table' AND tbl_name = {};",
    tbl
  )
}

pub fn table_opts_str(opts: &TableOptions) -> String {
  let mut options: Vec<&'static str> = vec![];
  if opts.contains(TableOptions::WITHOUT_ROWID) {
    options.push("WITHOUT ROWID");
  }
  if opts.contains(TableOptions::STRICT) {
    options.push("STRICT");
  }

  options.join(", ")
}

#[cfg(test)]
mod tests {
  use sqlite3_parser::ast::TableOptions;

  use super::table_opts_str;

  #[test]
  fn table_opts() {
    assert_eq!(table_opts_str(&TableOptions::NONE), "");
    assert_eq!(
      table_opts_str(&TableOptions::WITHOUT_ROWID),
      "WITHOUT ROWID"
    );
    assert_eq!(table_opts_str(&TableOptions::STRICT), "STRICT");
    let flags = TableOptions::WITHOUT_ROWID | TableOptions::STRICT;
    assert_eq!(table_opts_str(&flags), "WITHOUT ROWID, STRICT");
  }
}
