#![no_std]
#![feature(core_intrinsics)]
#![feature(alloc_error_handler)]
#![feature(lang_items)]

extern crate alloc;
extern crate crsql_automigrate_core;

use core::alloc::Layout;
use core::panic::PanicInfo;
use sqlite_nostd::SQLite3Allocator;

#[global_allocator]
static ALLOCATOR: SQLite3Allocator = SQLite3Allocator {};

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    core::intrinsics::abort()
}

#[alloc_error_handler]
fn oom(_: Layout) -> ! {
    core::intrinsics::abort()
}

#[lang = "eh_personality"]
extern "C" fn eh_personality() {}
