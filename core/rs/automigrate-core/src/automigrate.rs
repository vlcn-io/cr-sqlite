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

extern crate alloc;

// use alloc::string::String;
// use alloc::vec;
// use alloc::vec::Vec;
use alloc::vec::Vec;
use core::ffi::{c_char, c_int};
use core::slice;
// use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use sqlite::{args, Value};
use sqlite::{strlit, Context};
use sqlite::{Connection, ResultCode};
// use sqlite::Value;

/**
* Automigrate args:
* 0 - the schema version
* 1 - the schema content
* 2 - the list of extensions to load
*/
pub extern "C" fn crsql_automigrate(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
    // args: schema_version, schema, extension_paths...
    let _args = sqlite::args!(argc, argv);
    if argc < 2 {
        ctx.result_error("expected at least two arguments: schema_version, schema_content");
        return;
    }

    let args = args!(argc, argv);
    if let Err(_) = automigrate_impl(ctx, args) {
        ctx.result_error("failed to apply the updated schema");
        return;
    }

    ctx.result_text_transient("fii");
    // let db = db.unwrap();

    /*
    Could remove all the crrs statements...
    Or load the crr extensions back in...
    Or parse all the things...
    Have an arg to provide all extensions to load and their paths...
     */

    /*
    * The automigrate algorithm:
    * 1. Pull the supplied schema version of the input string
    * 2. Ensure it is greater than db's current schema version
    * 3. open a new in-memory db (w crsqlite loaded in the mem db -- detect via pragma query)
    * SELECT count(*) FROM pragma_function_list WHERE name = 'crsql_automigrate';
    * 4. apply supplied schema against the memory db
    * 5. find dropped tables
    * 6. find new tables
    * 7. find modified tables
    *
    * Modified tables:
    * 1. find new columns
    * 2. find dropped columns
    * 3. find modified columns -- we can't do this given we don't have a stable identifier for columns
    *   -- well we could if only type information on the columns changed or primary key participation changed
    *   -- need to also figure out index changes
    *
    * What do when primary key participation changes?
    * Would necessitate dropping all clock entries and re-creating?
    *
    * Test:
    * - All clock entries for removed columns are dropped
    * - How shall this interact with your `crsql_migrate_begin` methods?
    *  - These need testing to ensure proper clock table bookkeeping
    *  - Resurrect corretness tests?
    *  - Change py sqlite default config to auto-commit / tx?

    We can use `crsql_begin_alter` to do all the relevant bookkeeping.
    We only need to gather the diffs here.

    The diffs are gathered by comparing pragmas between both DBs for tables and table infos.
    */
    // ctx.result_text_owned(String::from("ello mate!"));
}

fn automigrate_impl(
    ctx: *mut sqlite::context,
    args: &[*mut sqlite::value],
) -> Result<ResultCode, ResultCode> {
    let local_db = ctx.db_handle();
    let desired_version = args[0].int();
    let stmt = local_db.prepare_v2(
        "SELECT prop.value FROM __crsql_master as m
            JOIN __crsql_master_prop as prop
            ON prop.master_id = m.id
            WHERE
                m.type = 'schema' AND
                m.name = 'version' AND
                prop.key = 'version'",
    )?;
    if stmt.step()? == ResultCode::ROW {
        let local_version = stmt.column_int(0)?;
        if local_version > desired_version {
            return Err(ResultCode::ERROR);
        }
    }

    // no version issues
    // go forth

    let desired_schema = args[1].text();
    let plugin_paths = &args[2..];

    apply_desired_schema(desired_version, desired_schema, plugin_paths)
}

fn apply_desired_schema(
    desired_version: i32,
    desired_schema: &str,
    plugin_paths: &[*mut sqlite::value],
) -> Result<ResultCode, ResultCode> {
    let mem_db = sqlite::open(strlit!(":memory:"))?;
    for plugin_path in plugin_paths {
        // split the path to see if we have an entrypoint
        let text_path = plugin_path.text();
        let path_parts = text_path.split(",").into_iter().collect::<Vec<_>>();

        // TODO: we need to raise an error if we're not compiled in a way
        // that we can load extensions...
        // well a loadable extension cannot load extensions so...
        // wtf we do?
        // we can strip out out crr related stufff...
        // we can do a different sdl...
        // we can implement auto-migrate in user spsace..
        // we can have the schema invoke load extension commands itself...
        // We can expose a function that takes a pointer to the mem db to use
        // that the user must create for us
        // this db is pre-configured to be what we need.
        // the api is then instead a "migrate to" api
        // where we're migrating to the schema provided by the in-mem db.
        //
        // Or simplify and provide "automigrate_table" and "automigrate_crr" methods.
        // These would just do table to table transforms and create if not exists.
        // dropping of tables would be done out of band.
        // this would give us enough info..
        #[cfg(all(feature = "static", not(feature = "omit_load_extension")))]
        mem_db.load_extension(text_path, None)
    }

    Ok(ResultCode::OK)
}

// fn find_dropped_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// fn find_new_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// struct ModifiedTable {
//     name: String,
//     new_columns: Vec<String>,
//     dropped_columns: Vec<String>,
//     modified_columns: Vec<String>,
// }

// fn find_modified_tables() -> Result<Vec<ModifiedTable>, ResultCode> {
//     Ok(vec![])
// }

// fn pull_schema_version(schema: &str) {
//     // pull first line
// }

#[no_mangle]
pub extern "C" fn sqlite3_crsqlautomigrate_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> c_int {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        "crsql_automigrate",
        -1,
        sqlite::UTF8,
        None,
        Some(crsql_automigrate),
        None,
        None,
        None,
    )
    .unwrap_or(sqlite::ResultCode::ERROR) as c_int
}
