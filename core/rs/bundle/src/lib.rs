/*
 * Copyright 2023 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#![no_std]
#![feature(core_intrinsics)]
#![feature(alloc_error_handler)]
#![feature(lang_items)]

extern crate alloc;

use core::alloc::GlobalAlloc;
use core::alloc::Layout;
use core::ffi::{c_char, c_int};
use core::panic::PanicInfo;
use crsql_core;
use crsql_core::sqlite3_crsqlcore_init;
use crsql_fractindex_core::sqlite3_crsqlfractionalindex_init;
use sqlite_nostd as sqlite;
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

#[cfg(not(target_family = "wasm"))]
#[lang = "eh_personality"]
extern "C" fn eh_personality() {}

#[cfg(target_family = "wasm")]
#[no_mangle]
pub extern "C" fn __rust_alloc(size: usize, align: usize) -> *mut u8 {
    unsafe { ALLOCATOR.alloc(Layout::from_size_align_unchecked(size, align)) }
}

#[cfg(target_family = "wasm")]
#[no_mangle]
pub extern "C" fn __rust_dealloc(ptr: *mut u8, size: usize, align: usize) {
    unsafe { ALLOCATOR.dealloc(ptr, Layout::from_size_align_unchecked(size, align)) }
}

#[cfg(target_family = "wasm")]
#[no_mangle]
pub extern "C" fn __rust_realloc(
    ptr: *mut u8,
    old_size: usize,
    align: usize,
    size: usize,
) -> *mut u8 {
    unsafe {
        ALLOCATOR.realloc(
            ptr,
            Layout::from_size_align_unchecked(old_size, align),
            size,
        )
    }
}

#[cfg(target_family = "wasm")]
#[no_mangle]
pub extern "C" fn __rust_alloc_zeroed(size: usize, align: usize) -> *mut u8 {
    unsafe { ALLOCATOR.alloc_zeroed(Layout::from_size_align_unchecked(size, align)) }
}

#[cfg(target_family = "wasm")]
#[no_mangle]
pub fn __rust_alloc_error_handler(_: Layout) -> ! {
    core::intrinsics::abort()
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlrustbundle_init(
    db: *mut sqlite::sqlite3,
    err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> c_int {
    sqlite::EXTENSION_INIT2(api);

    let rc = sqlite3_crsqlfractionalindex_init(db, err_msg, api);
    if rc != 0 {
        return rc;
    }

    sqlite3_crsqlcore_init(db, err_msg, api)
}
