// Explicit test for delete merging since that got broken in the most recent round
// of changes.
extern crate alloc;
use alloc::{ffi::CString, string::String};
use core::ffi::c_char;
use crsql_bundle::test_exports;
use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

fn test_merge_delete_prop_sync_case() {}
