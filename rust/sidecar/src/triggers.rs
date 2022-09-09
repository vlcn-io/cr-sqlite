use crate::{
  ast::{ColumnDefinitionExt, CreateTableBodyExt, QualifiedNameExt},
  sql_bits::ifne_str,
};
use indoc::indoc;
use sqlite3_parser::ast::{CreateTableBody, QualifiedName};

pub fn create_insert_trig(
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!(
    indoc! {"
    CREATE TRIGGER {if_not_exists} {trig_name}
      INSTEAD OF INSERT ON {view_name}
    BEGIN
      INSERT INTO {crr_tbl_name} (
        {base_columns}
      ) VALUES (
        {values}
      ) ON CONFLICT {on_conflict}

      {clock_insert}

      SELECT cfsql_bump_db_version();
    END
    "},
    if_not_exists = ifne_str(if_not_exists),
    trig_name = tbl_name.to_insert_trig_ident(),
    view_name = tbl_name.to_view_ident(),
    clock_insert = create_clock_insert(&tbl_name.to_crr_clock_table_ident().to_string()),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
    on_conflict = on_conflict(body),
    base_columns = body
      .non_crr_columns()
      .unwrap()
      .iter()
      .map(|c| format!("{}", c.col_name))
      .collect::<Vec<_>>()
      .join(",\n"),
    values = body
      .non_crr_columns()
      .unwrap()
      .iter()
      .map(|c| format!("NEW.{}", c.col_name))
      .collect::<Vec<_>>()
      .join(",\n")
  )
}

pub fn create_update_trig(
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  // TODO: we should eventually support compound primary keys.
  // The prototype migrator does.
  // TODO: try not bumping the db version
  // and instead using `sqlite3_total_changes` inside of `cfsql_db_version_base`
  format!(
    indoc! {"
    CREATE TRIGGER {if_not_exists} {trig_name}
      INSTEAD OF UPDATE ON {view_name}
    BEGIN
      UPDATE {crr_tbl_name} SET
        {update_body}
      WHERE {primary_key} = NEW.{primary_key};

      {clock_insert}

      SELECT cfsql_bump_db_version();
    END;
    "},
    if_not_exists = ifne_str(if_not_exists),
    trig_name = tbl_name.to_update_trig_ident(),
    view_name = tbl_name.to_view_ident(),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
    update_body = create_crr_update_body(body),
    primary_key = body.get_primary_key().unwrap().col_name,
    clock_insert = create_clock_insert(&tbl_name.to_crr_clock_table_ident().to_string())
  )
}

pub fn create_delete_trig(
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!("")
}

pub fn create_patch_trig(
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!("")
}

fn create_crr_update_body(body: &CreateTableBody) -> String {
  match body {
    CreateTableBody::ColumnsAndConstraints {
      columns,
      constraints,
      ..
    } => {
      let not_pks = columns.iter().filter(|c| !c.is_primary_key(constraints));
      let mut sets = not_pks
        .map(|c| {
          let version_of = c.version_of();
          if version_of.is_some() {
            format!(
              "{name} = CASE WHEN OLD.{version_of} != NEW.{version_of} THEN {name} + 1 ELSE {name} END",
              name = c.col_name,
              version_of = version_of.unwrap(),
            )
          } else {
            format!("{name} = NEW.{name}", name = c.col_name)
          }
        })
        .collect::<Vec<_>>();

      sets.push("\"cfsql_src\" = 0".to_string());
      sets.join(",\n")
    }
    _ => unreachable!(),
  }
}

fn create_clock_insert(clock_tbl_name: &String) -> String {
  format!(
    indoc! {"
    INSERT INTO {clock_tbl_name} (
      \"sitId\",
      \"version\",
      \"id\"
    )
    VALUES (
      cfsql_site_id(),
      cfsql_db_version() + 1,
      NEW.\"id\"
    )
    ON CONFLICT (\"siteId\", \"id\") DO UPDATE SET
      \"version\" = EXCLUDED.\"version\";
    "},
    clock_tbl_name = clock_tbl_name
  )
}

fn on_conflict(body: &CreateTableBody) -> String {
  "".to_string()
}
