use alloc::format;

use sqlite::{Connection, Context};
use sqlite_nostd as sqlite;
use sqlite_nostd::{ResultCode, Value};

use crate::c::crsql_ExtData;

pub const MERGE_EQUAL_VALUES: &str = "merge-equal-values";

pub extern "C" fn crsql_config_set(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);

    let name = args[0].text();

    let value = match name {
        MERGE_EQUAL_VALUES => {
            let value = args[1];
            let ext_data = ctx.user_data() as *mut crsql_ExtData;
            unsafe { (*ext_data).mergeEqualValues = value.int() };
            value
        }
        _ => {
            ctx.result_error("Unknown setting name");
            ctx.result_error_code(ResultCode::ERROR);
            return;
        }
    };

    let db = ctx.db_handle();
    match insert_config_setting(db, name, value) {
        Ok(value) => {
            ctx.result_value(value);
        }
        Err(rc) => {
            ctx.result_error("Could not persist config in database");
            ctx.result_error_code(rc);
            return;
        }
    }
}

fn insert_config_setting(
    db: *mut sqlite_nostd::sqlite3,
    name: &str,
    value: *mut sqlite::value,
) -> Result<*mut sqlite::value, ResultCode> {
    let stmt =
        db.prepare_v2("INSERT OR REPLACE INTO crsql_master VALUES (?, ?) RETURNING value")?;

    stmt.bind_text(1, &format!("config.{name}"), sqlite::Destructor::TRANSIENT)?;
    stmt.bind_value(2, value)?;

    if let ResultCode::ROW = stmt.step()? {
        stmt.column_value(0)
    } else {
        Err(ResultCode::ERROR)
    }
}

pub extern "C" fn crsql_config_get(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);

    let name = args[0].text();

    match name {
        MERGE_EQUAL_VALUES => {
            let ext_data = ctx.user_data() as *mut crsql_ExtData;
            ctx.result_int(unsafe { (*ext_data).mergeEqualValues });
        }
        _ => {
            ctx.result_error("Unknown setting name");
            ctx.result_error_code(ResultCode::ERROR);
            return;
        }
    }
}
