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

use alloc::vec::Vec;
use core::alloc::GlobalAlloc;
use core::alloc::Layout;
use core::ffi::{c_int, CStr};
use core::panic::PanicInfo;
use core::{ffi::c_char, slice};
use crsql_automigrate_core::sqlite3_crsqlautomigrate_init;
use crsql_core::backfill_table;
use crsql_fractindex_core::sqlite3_crsqlfractionalindex_init;
use sqlite_nostd as sqlite;
use sqlite_nostd::{context, Context, ResultCode, SQLite3Allocator};

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
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    let rc = sqlite3_crsqlfractionalindex_init(db, err_msg, api);
    if rc != 0 {
        return rc;
    }

    return sqlite3_crsqlautomigrate_init(db, err_msg, api);

    // load up all our rust extensions that contribute to the project
    // - automigrate
    // - fractional indexing
    // - rga
    // - eventually crsql core post port
}

#[no_mangle]
pub extern "C" fn crsql_backfill_table(
    context: *mut context,
    table: *const c_char,
    pk_cols: *const *const c_char,
    pk_cols_len: c_int,
    non_pk_cols: *const *const c_char,
    non_pk_cols_len: c_int,
) -> c_int {
    let table = unsafe { CStr::from_ptr(table).to_str() };
    let pk_cols = unsafe {
        let parts = slice::from_raw_parts(pk_cols, pk_cols_len as usize);
        parts
            .iter()
            .map(|&p| CStr::from_ptr(p).to_str())
            .collect::<Result<Vec<_>, _>>()
    };
    let non_pk_cols = unsafe {
        let parts = slice::from_raw_parts(non_pk_cols, non_pk_cols_len as usize);
        parts
            .iter()
            .map(|&p| CStr::from_ptr(p).to_str())
            .collect::<Result<Vec<_>, _>>()
    };

    let result = match (table, pk_cols, non_pk_cols) {
        (Ok(table), Ok(pk_cols), Ok(non_pk_cols)) => {
            let db = context.db_handle();
            backfill_table(db, table, pk_cols, non_pk_cols)
        }
        _ => Err(ResultCode::ERROR),
    };

    match result {
        Ok(result) => result as c_int,
        Err(result) => result as c_int,
    }
}
