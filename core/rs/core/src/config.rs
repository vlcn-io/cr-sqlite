use sqlite::Context;
use sqlite_nostd as sqlite;
use sqlite_nostd::{ResultCode, Value};

use crate::c::crsql_ExtData;

pub extern "C" fn crsql_config_set(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);

    let name = args[0].text();

    match name {
        "always-declare-winner" => {
            let value = args[1].int() == 1;
            let ext_data = ctx.user_data() as *mut crsql_ExtData;
            unsafe { (*ext_data).tieBreakSameColValue = value };
        }
        _ => {
            ctx.result_error("Unknown setting name");
            ctx.result_error_code(ResultCode::ERROR);
            return;
        }
    }

    ctx.result_error_code(ResultCode::OK);
}
