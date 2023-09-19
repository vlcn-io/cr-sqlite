extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec;
use sqlite::Connection;

use core::{ffi::c_char, str::Utf8Error};

use sqlite::{sqlite3, ResultCode};
use sqlite_nostd as sqlite;

use crate::tableinfo::TableInfo;

pub fn create_triggers(
    db: *mut sqlite3,
    table_info: &TableInfo,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    create_insert_trigger(db, table_info, err)?;
    create_update_trigger(db, table_info, err)?;
    create_delete_trigger(db, table_info, err)
}

fn create_insert_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let pk_list = crate::util::as_identifier_list(&table_info.pks, None)?;
    let pk_new_list = crate::util::as_identifier_list(&table_info.pks, Some("NEW."))?;
    let pk_where_list = crate::util::pk_where_list(&table_info.pks, Some("NEW."))?;
    let trigger_body = insert_trigger_body(
        table_info,
        &table_info.tbl_name,
        pk_list,
        pk_new_list,
        pk_where_list,
    )?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_itrig\"
      AFTER INSERT ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
      BEGIN
        {trigger_body}
      END;",
        table_name = crate::util::escape_ident(&table_info.tbl_name),
        trigger_body = trigger_body
    );

    db.exec_safe(&create_trigger_sql)
}

fn insert_trigger_body(
    table_info: &TableInfo,
    table_name: &str,
    pk_list: String,
    pk_new_list: String,
    pk_where_list: String,
) -> Result<String, Utf8Error> {
    let mut trigger_components = vec![];

    if table_info.non_pks.len() == 0 {
        // a table that only has primary keys.
        // we'll need to record a create record in this case.
        // we need to...
        // 1. create a function to do all the things?
        // 2. use last_insert_rowid... but if there were conflicts?
        trigger_components.push(format!(
            "INSERT INTO \"{table_name}__crsql_clock\" (
            {pk_list},
            col_name,
            col_version,
            db_version,
            seq,
            site_id
            ) SELECT
            {pk_new_list},
            '{col_name}',
            1,
            crsql_next_db_version(),
            crsql_increment_and_get_seq(),
            NULL
          ON CONFLICT DO UPDATE SET
            col_version = CASE col_version % 2 WHEN 0 THEN col_version + 1 ELSE col_version + 2 END,
            db_version = crsql_next_db_version(),
            seq = crsql_get_seq() - 1,
            site_id = NULL;",
            table_name = crate::util::escape_ident(table_name),
            pk_list = &pk_list,
            pk_new_list = &pk_new_list,
            col_name = crate::c::INSERT_SENTINEL
        ));
    } else {
        // only update the create record if it exists.
        // this is an optimization so as not to create create records
        // for things that don't strictly need them.
        trigger_components.push(format!(
            "UPDATE \"{table_name}__crsql_clock\" SET
            col_version = CASE col_version % 2 WHEN 0 THEN col_version + 1 ELSE col_version + 2 END,
            db_version = crsql_next_db_version(),
            seq = crsql_increment_and_get_seq(),
            site_id = NULL
          WHERE {pk_where_list} AND col_name = '{col_name}';",
            table_name = crate::util::escape_ident(table_name),
            pk_where_list = pk_where_list,
            col_name = crate::c::INSERT_SENTINEL
        ));
    }

    for col in table_info.non_pks.iter() {
        trigger_components.push(format_insert_trigger_component(
            table_name,
            &pk_list,
            &pk_new_list,
            &col.name,
        ))
    }

    Ok(trigger_components.join("\n"))
}

fn format_insert_trigger_component(
    table_name: &str,
    pk_list: &str,
    pk_new_list: &str,
    col_name: &str,
) -> String {
    format!(
        "INSERT INTO \"{table_name}__crsql_clock\" (
          {pk_list},
          col_name,
          col_version,
          db_version,
          seq,
          site_id
        ) SELECT
          {pk_new_list},
          '{col_name}',
          1,
          crsql_next_db_version(),
          crsql_increment_and_get_seq(),
          NULL
        ON CONFLICT DO UPDATE SET
          col_version = col_version + 1,
          db_version = crsql_next_db_version(),
          seq = crsql_get_seq() - 1,
          site_id = NULL;",
        table_name = crate::util::escape_ident(table_name),
        pk_list = pk_list,
        pk_new_list = pk_new_list,
        col_name = crate::util::escape_ident_as_value(col_name)
    )
}

fn create_update_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let table_name = &table_info.tbl_name;
    let pk_columns = &table_info.pks;
    let pk_list = crate::util::as_identifier_list(pk_columns, None)?;
    let pk_new_list = crate::util::as_identifier_list(pk_columns, Some("NEW."))?;
    let pk_old_list = crate::util::as_identifier_list(pk_columns, Some("OLD."))?;
    let pk_where_list = crate::util::pk_where_list(pk_columns, Some("OLD."))?;
    let mut any_pk_differs = vec![];
    for c in pk_columns {
        any_pk_differs.push(format!(
            "NEW.\"{col_name}\" IS NOT OLD.\"{col_name}\"",
            col_name = crate::util::escape_ident(&c.name)
        ));
    }
    let any_pk_differs = any_pk_differs.join(" OR ");

    // Changing a primary key to a new value is the same as deleting the row previously
    // identified by that primary key. TODO: share this code with `create_delete_trigger`
    for col in pk_columns {
        let col_name = &col.name;
        db.exec_safe(&format!(
            "CREATE TRIGGER IF NOT EXISTS \"{tbl_name}_{col_name}__crsql_utrig\"
          AFTER UPDATE OF \"{col_name}\" ON \"{tbl_name}\"
          WHEN crsql_internal_sync_bit() = 0 AND NEW.\"{col_name}\" IS NOT OLD.\"{col_name}\"
          BEGIN
            INSERT INTO \"{table_name}__crsql_clock\" (
              {pk_list},
              col_name,
              col_version,
              db_version,
              seq,
              site_id
            ) SELECT
              {pk_old_list},
              '{sentinel}',
              2,
              crsql_next_db_version(),
              crsql_increment_and_get_seq(),
              NULL WHERE true
            ON CONFLICT DO UPDATE SET
              col_version = 1 + col_version,
              db_version = crsql_next_db_version(),
              seq = crsql_get_seq() - 1,
              site_id = NULL;
            DELETE FROM \"{table_name}__crsql_clock\"
              WHERE {pk_where_list} AND col_name != '{sentinel}';
          END;",
            tbl_name = crate::util::escape_ident(table_name),
            col_name = crate::util::escape_ident(col_name),
            pk_list = pk_list,
            pk_old_list = pk_old_list,
            sentinel = crate::c::DELETE_SENTINEL,
        ))?;
    }

    let trigger_body =
        update_trigger_body(table_info, table_name, pk_list, pk_new_list, any_pk_differs)?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_utrig\"
      AFTER UPDATE ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
      BEGIN
        {trigger_body}
      END;",
        table_name = crate::util::escape_ident(table_name),
        trigger_body = trigger_body
    );

    db.exec_safe(&create_trigger_sql)
}

fn update_trigger_body(
    table_info: &TableInfo,
    table_name: &str,
    pk_list: String,
    pk_new_list: String,
    any_pk_differs: String,
) -> Result<String, Utf8Error> {
    let non_pk_columns = &table_info.non_pks;
    let mut trigger_components = vec![];

    // If any PK is different, record a create for the row
    // as setting a PK to a _new value_ is like insertion or creating a row.
    // If we have CL and we conflict.. and pk is not _dead_, ignore?
    trigger_components.push(format!(
        "INSERT INTO \"{table_name}__crsql_clock\" (
          {pk_list},
          col_name,
          col_version,
          db_version,
          seq,
          site_id
        ) SELECT
          {pk_new_list},
          '{sentinel}',
          1,
          crsql_next_db_version(),
          crsql_increment_and_get_seq(),
          NULL
        WHERE {any_pk_differs}
        ON CONFLICT DO UPDATE SET
          col_version = CASE col_version % 2 WHEN 0 THEN col_version + 1 ELSE col_version + 2 END,
          db_version = crsql_next_db_version(),
          seq = crsql_get_seq() - 1,
          site_id = NULL;",
        table_name = crate::util::escape_ident(table_name),
        pk_list = pk_list,
        pk_new_list = pk_new_list,
        sentinel = crate::c::INSERT_SENTINEL,
        any_pk_differs = any_pk_differs
    ));

    for col in non_pk_columns {
        trigger_components.push(format!(
            "INSERT INTO \"{table_name}__crsql_clock\" (
          {pk_list},
          col_name,
          col_version,
          db_version,
          seq,
          site_id
        ) SELECT
          {pk_new_list},
          '{col_name_val}',
          1,
          crsql_next_db_version(),
          crsql_increment_and_get_seq(),
          NULL
        WHERE NEW.\"{col_name_ident}\" IS NOT OLD.\"{col_name_ident}\"
        ON CONFLICT DO UPDATE SET
          col_version = col_version + 1,
          db_version = crsql_next_db_version(),
          seq = crsql_get_seq() - 1,
          site_id = NULL;",
            table_name = crate::util::escape_ident(table_name),
            pk_list = pk_list,
            pk_new_list = pk_new_list,
            col_name_val = crate::util::escape_ident_as_value(&col.name),
            col_name_ident = crate::util::escape_ident(&col.name)
        ))
    }

    Ok(trigger_components.join("\n"))
}

fn create_delete_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let table_name = &table_info.tbl_name;
    let pk_columns = &table_info.pks;
    let pk_list = crate::util::as_identifier_list(pk_columns, None)?;
    let pk_old_list = crate::util::as_identifier_list(pk_columns, Some("OLD."))?;
    let pk_where_list = crate::util::pk_where_list(pk_columns, Some("OLD."))?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_dtrig\"
    AFTER DELETE ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
    BEGIN
      INSERT INTO \"{table_name}__crsql_clock\" (
        {pk_list},
        col_name,
        col_version,
        db_version,
        seq,
        site_id
      ) SELECT
        {pk_old_list},
        '{sentinel}',
        2,
        crsql_next_db_version(),
        crsql_increment_and_get_seq(),
        NULL WHERE true
      ON CONFLICT DO UPDATE SET
        col_version = 1 + col_version,
        db_version = crsql_next_db_version(),
        seq = crsql_get_seq() - 1,
        site_id = NULL;
      DELETE FROM \"{table_name}__crsql_clock\"
        WHERE {pk_where_list} AND col_name != '{sentinel}';
    END;",
        table_name = crate::util::escape_ident(table_name),
        sentinel = crate::c::DELETE_SENTINEL,
        pk_where_list = pk_where_list,
        pk_old_list = pk_old_list
    );

    db.exec_safe(&create_trigger_sql)
}
