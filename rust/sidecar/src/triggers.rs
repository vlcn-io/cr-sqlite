use crate::{
  ast::{ColumnDefinitionExt, CreateTableBodyExt, QualifiedNameExt},
  sql_bits::ifne_str,
};
use indoc::indoc;
use itertools::Itertools;
use sqlite3_parser::ast::{ColumnDefinition, CreateTableBody, NamedTableConstraint, QualifiedName};

const SET_CL: &str =
  "\"cfsql_cl\" = CASE WHEN \"cfsql_cl\" % 2 = 0 THEN \"cfsql_cl\" + 1 ELSE \"cfsql_cl\" END";

/**
 * Creates a trigger for local inserts that:
 * 1. bumps version columns
 * 2. saves the clock snapshot for the inserted row
 * 3. bumps the global db version
 *
 * If the row was previously deleted the causal length is bumped as well.
 * TODO: does this always hold? If someone performs an upsert do we not "set deleted" with the current logic?
 */
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
      .intersperse(",\n".to_string())
      .collect::<String>(),
    values = body
      .non_crr_columns()
      .unwrap()
      .iter()
      .map(|c| format!("NEW.{}", c.col_name))
      .intersperse(",\n".to_string())
      .collect::<String>()
  )
}

/**
 * Creates an update trigger for local inserts that:
 * 1. bumps version columns
 * 2. saves the clock snapshot for the updated row
 * 3. bumps the global db version
 */
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
    END
    "},
    if_not_exists = ifne_str(if_not_exists),
    trig_name = tbl_name.to_update_trig_ident(),
    view_name = tbl_name.to_view_ident(),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
    update_body = match body {
      CreateTableBody::ColumnsAndConstraints {
        columns,
        constraints,
        ..
      } => {
        let mut sets = create_sets(columns, constraints);

        sets.push("\"cfsql_src\" = 0".to_string());
        sets.join(",\n")
      }
      _ => unreachable!(),
    },
    primary_key = body.get_primary_key().unwrap().col_name,
    clock_insert = create_clock_insert(&tbl_name.to_crr_clock_table_ident().to_string())
  )
}

/**
 * Creates a trigger for local deletes that:
 * 1. increments the causal length of the thing being deleted
 */
pub fn create_delete_trig(if_not_exists: &bool, tbl_name: &QualifiedName) -> String {
  format!(
    indoc! {"
    CREATE TRIGGER {if_not_exists} {trig_name}
      INSTEAD OF DELETE ON {view_name}
    BEGIN
      UPDATE {crr_tbl_name} SET {set_cl}
    END
    "},
    if_not_exists = ifne_str(if_not_exists),
    trig_name = tbl_name.to_delete_trig_ident(),
    view_name = tbl_name.to_view_ident(),
    crr_tbl_name = tbl_name.to_crr_table_ident(),
    set_cl = SET_CL.to_string(),
  )
}

/**
 * Creates a trigger to process remote updates or patch sets.
 */
pub fn create_patch_trig(
  if_not_exists: &bool,
  tbl_name: &QualifiedName,
  body: &CreateTableBody,
) -> String {
  format!("")
}

fn create_sets(
  columns: &Vec<ColumnDefinition>,
  constraints: &Option<Vec<NamedTableConstraint>>,
) -> Vec<String> {
  let not_pks = columns.iter().filter(|c| !c.is_primary_key(constraints));
  not_pks
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
    .collect::<Vec<_>>()
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
  format!(
    indoc! {"
    ({primary_key}) DO UPDATE SET
      {cf_sets}
    "},
    primary_key = body.get_primary_key().unwrap().col_name,
    cf_sets = match body {
      CreateTableBody::ColumnsAndConstraints {
        columns,
        constraints,
        ..
      } => {
        let mut sets = create_sets(columns, constraints);

        sets.push("\"cfsql_src\" = 0".to_string());
        sets.push(SET_CL.to_string());
        sets.join(",\n")
      }
      _ => unreachable!(),
    }
  )
}
