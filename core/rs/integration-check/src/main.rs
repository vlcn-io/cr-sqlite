use std::ffi::c_void;

extern crate crsql_bundle;

// Force the linker to keep this stuff even though it is not used in our crate
pub use crsql_bundle::crsql_core::*;
pub use crsql_bundle::sqlite::*;
pub use crsql_bundle::*;

pub fn main() {
    println!("Hello, world!");
}
