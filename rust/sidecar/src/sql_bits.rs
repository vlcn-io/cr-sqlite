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
