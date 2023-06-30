use sqlite::{Connection, ResultCode};
use sqlite_nostd as sqlite;

#[test]
fn concat_columns() {
    // concat then unpack
    concat_columns_impl().unwrap();
}

fn concat_columns_impl() -> Result<(), ResultCode> {
    let db = integration_utils::opendb()?;
    db.db.exec_safe("CREATE TABLE foo (id PRIMARY KEY, x, y)")?;
    let insert_stmt = db.db.prepare_v2("INSERT INTO foo VALUES (?, ?, ?)")?;
    let blob: [u8; 3] = [1, 2, 3];

    insert_stmt.bind_int(1, 12)?;
    insert_stmt.bind_text(2, "str", sqlite::Destructor::STATIC)?;
    insert_stmt.bind_blob(3, &blob, sqlite::Destructor::STATIC)?;
    insert_stmt.step()?;

    let select_stmt = db
        .db
        .prepare_v2("SELECT quote(crsql_concat_columns(id, x, y)) FROM foo")?;
    select_stmt.step()?;
    let result = select_stmt.column_text(0)?;
    println!("{}", result);
    Ok(())
}
