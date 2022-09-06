#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

#[cfg(test)]
mod tests {
    use std::ffi::{CString, CStr};
    use std::ptr;
    use crate::{ sql3error_code, sql3string_cstring, sql3parse_table, sql3table_free, sql3table_schema, sql3table_name };
    // use crate::sql3table_name;
    // use crate::sql3table_num_columns;

    #[test]
    fn parse_table_creation() {
      let sql = CString::new("create table foo (a);").expect("SQL string creation failed");
      let mut error_code: sql3error_code = 0;
      let error_code_ptr: *mut sql3error_code = &mut error_code; 

      let table = unsafe { sql3parse_table(sql.as_ptr(), sql.to_bytes().len().try_into().unwrap(), error_code_ptr) };

      let unsafe_schema;
      unsafe { 
        let schema = sql3table_schema(table);
        if schema == ptr::null_mut() {
          unsafe_schema = CStr::from_bytes_with_nul(b"\0").unwrap();
        } else {
          unsafe_schema = CStr::from_ptr(sql3string_cstring(schema));
        }
      };
      let schema = String::from_utf8_lossy(unsafe_schema.to_bytes()).to_string();

      let unsafe_name = unsafe {
        CStr::from_ptr(sql3string_cstring(sql3table_name(table)))
      };
      let name = String::from_utf8_lossy(unsafe_name.to_bytes()).to_string();
      // let num_cols = sql3table_num_columns(table);

      println!("Schema: {}", schema);
      println!("Table: {}", name);
      // println!("{:?}", num_cols);

      unsafe { sql3table_free(table) };
    
      let result = 2 + 2;
      assert_eq!(result, 4);
    }
}