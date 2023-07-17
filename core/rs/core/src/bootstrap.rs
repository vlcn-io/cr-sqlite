use crate::consts;
use alloc::format;
use sqlite::{sqlite3, Connection, Destructor, ResultCode};
use sqlite_nostd as sqlite;

fn uuid(blob: &mut [u8]) {
    sqlite::randomness(blob);
    blob[6] = (blob[6] & 0x0f) + 0x40;
    blob[8] = (blob[8] & 0x3f) + 0x80;
}

fn create_site_id_and_site_id_table(
    db: *mut sqlite3,
    site_id: &mut [u8],
) -> Result<ResultCode, ResultCode> {
    db.exec_safe(&format!(
        "CREATE TABLE \"{tbl}\" (site_id)",
        tbl = consts::TBL_SITE_ID
    ))?;

    let stmt = db.prepare_v2(&format!(
        "INSERT INTO \"{tbl}\" (site_id) VALUES (?)",
        tbl = consts::TBL_SITE_ID
    ))?;

    uuid(site_id);
    stmt.bind_blob(1, &site_id, Destructor::STATIC)?;
    stmt.step()
}
