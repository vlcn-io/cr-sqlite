use core::ffi::{c_char, c_int};
use core::mem::ManuallyDrop;

use crate::alloc::string::ToString;
use crate::c::crsql_ExtData;
use alloc::boxed::Box;
use alloc::format;
use alloc::slice;
use alloc::string::String;
use alloc::vec::Vec;
use sqlite::{Context, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::tableinfo::{crsql_ensure_table_infos_are_up_to_date, TableInfo};

mod after_update;

pub fn trigger_fn_preamble<F>(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
    f: F,
) -> Result<ResultCode, String>
where
    F: Fn(&TableInfo, &[*mut sqlite::value], *mut crsql_ExtData) -> Result<ResultCode, String>,
{
    if argc < 1 {
        return Err("expected at least 1 argument".to_string());
    }

    let values = sqlite::args!(argc, argv);
    let ext_data = sqlite::user_data(ctx) as *mut crsql_ExtData;
    let mut inner_err: *mut c_char = core::ptr::null_mut();
    let outer_err: *mut *mut c_char = &mut inner_err;

    let rc = crsql_ensure_table_infos_are_up_to_date(ctx.db_handle(), ext_data, outer_err);
    if rc != ResultCode::OK as c_int {
        return Err(format!(
            "failed to ensure table infos are up to date: {}",
            rc
        ));
    }

    let table_infos =
        unsafe { ManuallyDrop::new(Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>)) };
    let table_name = values[0].text();
    let table_info = match table_infos.iter().find(|t| &(t.tbl_name) == table_name) {
        Some(t) => t,
        None => {
            return Err(format!("table {} not found", table_name));
        }
    };

    f(table_info, &values, ext_data)
}
