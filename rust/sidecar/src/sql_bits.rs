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

pub fn sorted_col_name_ident_list() -> Vec<String> {
  vec![]
}
