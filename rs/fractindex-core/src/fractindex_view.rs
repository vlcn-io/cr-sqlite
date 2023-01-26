use sqlite_nostd::{context, sqlite3, Connection, Context, ResultCode, Value};
extern crate alloc;
use alloc::format;
use alloc::vec::Vec;

use crate::util::{escape_ident, extract_columns, extract_pk_columns, where_predicates};

pub fn create_fract_view_and_triggers(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    // extract pk information from pragma table_info
    let pks = extract_pk_columns(db, table)?;

    let after_pk_defs = pks
        .iter()
        .map(|pk| format!("NULL AS \"after_{}\"", pk.text().replace("\"", "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "CREATE VIEW IF NOT EXISTS \"{table}_fractindex\" AS
        SELECT *, {after_pk_defs}
        FROM \"{table}\"",
        table = escape_ident(table),
        after_pk_defs = after_pk_defs
    );

    db.exec_safe(&sql)?;

    craete_instead_of_insert_trigger(db, table, order_by_column, collection_columns)?;
    create_instead_of_update_trigger()?;

    Ok(ResultCode::OK)
}

fn craete_instead_of_insert_trigger(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    let columns = extract_columns(db, table)?;
    let pks = extract_pk_columns(db, table)?;
    let columns_ex_order = columns
        .iter()
        .filter(|col| col.text() != order_by_column.text())
        .collect::<Vec<_>>();

    let col_names_ex_order = columns_ex_order
        .iter()
        .map(|col| format!("\"{}\"", escape_ident(col.text())))
        .collect::<Vec<_>>()
        .join(", ");

    let col_values_ex_order = columns_ex_order
        .iter()
        .map(|col| format!("NEW.\"{}\"", escape_ident(col.text())))
        .collect::<Vec<_>>()
        .join(", ");

    let after_pk_values = pks
        .iter()
        .map(|pk| format!("NEW.\"after_{}\"", escape_ident(pk.text())))
        .collect::<Vec<_>>()
        .join(", ");

    let list_predicates = where_predicates(collection_columns)?;

    let after_predicates = where_predicates(&pks)?;

    let list_bind_slots = collection_columns
        .iter()
        .map(|x| "?")
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table}_fractindex_insert_trig\"
        INSTEAD OF INSERT ON \"{table}_fractindex\"
        BEGIN
            INSERT INTO \"{table}\"
              ({col_names_ex_order}, \"{order_col}\")
            VALUES
              (
                {col_values_ex_order},
                CASE (
                  SELECT count(*) FROM \"{table}\" WHERE {list_predicates} AND \"{order_col}\" = (SELECT \"{order_col}\" FROM \"{table}\" WHERE {after_predicates})
                )
                  WHEN 0 THEN crsql_fract_key_between(
                    (SELECT \"{order_col}\" FROM \"{table}\" WHERE {after_predicates}),
                    (SELECT \"{order_col}\" FROM \"{table}\" WHERE {list_predicates} AND \"{order_col}\" > (SELECT \"{order_col}\" FROM \"{table}\" WHERE {after_predicates}) LIMIT 1)
                  )
                  ELSE crsql_fract_fix_conflict_return_old_key(
                    ?, ?, {list_bind_slots}{maybe_comma} -1, ?, {after_pk_values}
                  )
              );
        END;",
        table = escape_ident(table),
        col_names_ex_order = col_names_ex_order,
        col_values_ex_order = col_values_ex_order,
        order_col = escape_ident(order_by_column.text()),
        list_predicates = list_predicates,
        list_bind_slots = list_bind_slots,
        maybe_comma = if list_bind_slots.len() > 0 { ", " } else { "" },
        after_predicates = after_predicates,
        after_pk_values = after_pk_values
    );
    let stmt = db.prepare_v2(&sql)?;

    let mut bind_index = 1;
    // table arg
    stmt.bind_text(bind_index, table)?;
    bind_index += 1;
    // order col
    stmt.bind_value(bind_index, order_by_column)?;
    bind_index += 1;

    // collection column names
    for col in collection_columns {
        stmt.bind_value(bind_index, *col)?;
        bind_index += 1;
    }

    // after pk names
    for name in pks {
        stmt.bind_text(bind_index, &format!("after_{}", escape_ident(name.text())))?;
        bind_index += 1;
    }

    stmt.step()
}

fn create_instead_of_update_trigger() -> Result<ResultCode, ResultCode> {
    // all the same problems as insert?
    // we can be updating to place after a thing with conflicts.
    // if that's the case do all the same things
    Ok(ResultCode::OK)
}

pub fn crsql_fract_fix_conflict_return_old_key(
    ctx: *mut context,
    db: *mut sqlite3,
    table: &str,
    order_col: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
    pk_names: &[*mut sqlite_nostd::value],
    pk_values: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    let pk_predicates = pk_names
        .iter()
        .enumerate()
        .map(|(i, pk_name)| format!("\"{}\" = ?{}", escape_ident(pk_name.text()), i + 1))
        .collect::<Vec<_>>()
        .join(", AND");
    let sql = format!(
        "SELECT \"{order_col}\" FROM \"{table}\" WHERE {pk_predicates}",
        order_col = escape_ident(order_col.text()),
        table = escape_ident(table),
        pk_predicates = pk_predicates
    );
    let stmt = db.prepare_v2(&sql)?;
    let code = stmt.step()?;
    if code == ResultCode::DONE {
        // this should be impossible
        return Err(ResultCode::ERROR);
    }

    let target_order = stmt.column_value(0)?;

    let list_join_predicates = collection_columns
        .iter()
        .map(|col| {
            format!(
                "\"{table}\".\"{col}\" = t.\"{col}\"",
                table = escape_ident(table),
                col = escape_ident(col.text())
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");

    let sql = format!(
        "UPDATE \"{table}\" SET \"{order_col}\" = crsql_fract_key_between(
        (
          SELECT \"{order_col}\" FROM \"{table}\"
          JOIN (SELECT \"{order_col}\" FROM \"{table}\" WHERE {pk_predicates}) as t
          ON {list_join_predicates} WHERE \"{order_col}\" < ?{target_order_slot} ORDER BY \"{order_col}\" DESC LIMIT 1
        ),
        ?{target_order_slot}
      ) WHERE {pk_predicates}",
        table = escape_ident(table),
        order_col = escape_ident(order_col.text()),
        pk_predicates = pk_predicates,
        list_join_predicates = list_join_predicates,
        target_order_slot = pk_values.len() + 1
    );

    let stmt = db.prepare_v2(&sql)?;
    // bind pk_predicates
    for (i, val) in pk_values.iter().enumerate() {
        stmt.bind_value(i as i32 + 1, *val)?;
    }
    // bind target_order
    stmt.bind_value(pk_values.len() as i32 + 1, target_order)?;
    stmt.step()?;

    ctx.result_text_shared(target_order.text());

    Ok(ResultCode::OK)
}
