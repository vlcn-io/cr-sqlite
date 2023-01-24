#![cfg_attr(not(test), no_std)]
#![allow(non_upper_case_globals)]
#![feature(core_intrinsics)]

mod as_ordered;
mod fractindex;

pub use fractindex::*;
