use sqlite::Connection;
use sqlite::Destructor;
use sqlite_nostd as sqlite;

pub fn sync_left_to_right(
    l: &dyn Connection,
    r: &dyn Connection,
    since: sqlite::int64,
) -> Result<sqlite::ResultCode, sqlite::ResultCode> {
    // let siteid_stmt = r.prepare_v2("SELECT crsql_siteid()")?;
    // siteid_stmt.step()?;
    // let siteid = siteid_stmt.column_blob(0)?;

    // let stmt_l =
    //     l.prepare_v2("SELECT * FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?")?;
    // stmt_l.bind_int64(1, since)?;
    // stmt_l.bind_blob(2, siteid, Destructor::STATIC)?;

    // while stmt_l.step()? == sqlite::ResultCode::ROW {
    //     let stmt_r = r.prepare_v2("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)")?;
    //     for x in 0..7 {
    //         stmt_r.bind_value(x + 1, stmt_l.column_value(x)?)?;
    //     }
    //     stmt_r.step()?;
    // }
    Ok(sqlite::ResultCode::OK)
}
