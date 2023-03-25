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
use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

// TODO: auto-calculate starting number
integration_utils::counter_setup!(1);

#[test]
fn invoke_automigrate() {
    invoke_automigrate_impl().unwrap();
    decrement_counter();
}

fn invoke_automigrate_impl() -> Result<(), ResultCode> {
    let db = integration_utils::opendb()?;
    let stmt = db.db.prepare_v2("SELECT crsql_automigrate('BLAH')")?;
    stmt.step()?;
    let text = stmt.column_text(0)?;
    println!("text: {:?}", text);
    Ok(())
}
