pub fn ifne_str(if_not_exists: bool) -> &'static str {
  if if_not_exists {
    "IF NOT EXISTS"
  } else {
    ""
  }
}

pub fn temp_str(temporary: bool) -> &'static str {
  if temporary {
    "TEMPORARY"
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
