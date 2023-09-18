use std::ffi::c_void;

extern crate crsql_bundle;

pub fn main() {
    let ptr = crsql_bundle::sqlite::malloc(1);
    crsql_bundle::sqlite::free(ptr as *mut c_void);
    println!("Hello, world!");
}
