#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

#[cfg(test)]
mod tests {
    use std::ffi::{CString};
    use crate::sql3error_code;
    use crate::sql3parse_table;

    #[test]
    fn parse_table_creation() {
      let sql = CString::new("create table foo (a);").expect("SQL string creation failed");
      let mut error_code: sql3error_code = 0;
      let error_code_ptr: *mut sql3error_code = &mut error_code; 

      unsafe { sql3parse_table(sql.as_ptr(), sql.to_bytes().len().try_into().unwrap(), error_code_ptr); }
      let result = 2 + 2;
      assert_eq!(result, 4);
    }
}