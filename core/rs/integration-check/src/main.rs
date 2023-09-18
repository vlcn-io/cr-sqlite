use std::env;
use std::ffi::c_void;
use std::ptr;

extern crate crsql_bundle;

extern "C" {
    pub fn core_init(d: *mut c_char);
}

pub fn main() {
    println!("Hello, world!");
    let args: Vec<String> = env::args().collect();
    if args.len() > 5 {
        unsafe {
            core_init(ptr::null_mut());
        }
    }
}
