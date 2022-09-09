use std::fmt::{self, Display, Formatter};

use sqlite3_parser::ast::{
  ColumnConstraint, ColumnDefinition, CreateTableBody, Name, QualifiedName, ToTokens,
};

// TODO: push down to name struct or add there as well
pub trait QualifiedNameExt {
  fn to_view_ident(&self) -> String;
  fn to_patch_view_ident(&self) -> String;
  fn to_crr_table_ident(&self) -> String;
  fn to_crr_clock_table_ident(&self) -> String;
  fn to_insert_trig_ident(&self) -> String;
  fn to_update_trig_ident(&self) -> String;
  fn to_delete_trig_ident(&self) -> String;
  fn to_patch_trig_ident(&self) -> String;
  fn to_ident(&self) -> String;
}

pub trait NameExt {
  fn to_view_ident(&self) -> String;
  fn to_patch_view_ident(&self) -> String;
  fn to_crr_table_ident(&self) -> String;
  fn to_crr_clock_table_ident(&self) -> String;
  fn to_insert_trig_ident(&self) -> String;
  fn to_update_trig_ident(&self) -> String;
  fn to_delete_trig_ident(&self) -> String;
  fn to_patch_trig_ident(&self) -> String;
  fn to_ident(&self) -> String;
}

pub trait CreateTableBodyExt {
  fn non_crr_columns(&self) -> Result<Vec<&ColumnDefinition>, &'static str>;
}

pub trait ColumnDefinitionExt {
  fn is_primary_key(&self) -> bool;
}

impl QualifiedNameExt for QualifiedName {
  fn to_view_ident(&self) -> String {
    QualifiedNameExt::to_ident(self)
  }

  fn to_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("{}.{}", db_name.to_ident(), self.name.to_ident()),
      None => format!("\"{}\"", self.name.0),
    }
  }

  fn to_patch_view_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("{}.{}", db_name.to_ident(), self.name.to_patch_view_ident()),
      None => format!("\"cfsql_patch__{}\"", self.name.0),
    }
  }

  fn to_crr_table_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("{}.{}", db_name.to_ident(), self.name.to_crr_table_ident()),
      None => format!("\"cfsql_crr__{}\"", self.name.0),
    }
  }

  fn to_crr_clock_table_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!(
        "{}.{}",
        db_name.to_ident(),
        self.name.to_crr_clock_table_ident()
      ),
      None => format!("\"cfsql_clock__{}\"", self.name.0),
    }
  }

  fn to_insert_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!(
        "{}.{}",
        db_name.to_ident(),
        self.name.to_insert_trig_ident()
      ),
      None => format!("\"cfsql_ins_trig__{}\"", self.name.0),
    }
  }

  fn to_update_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!(
        "{}.{}",
        db_name.to_ident(),
        self.name.to_update_trig_ident()
      ),
      None => format!("\"cfsql_up_trig__{}\"", self.name.0),
    }
  }

  fn to_delete_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!(
        "{}.{}",
        db_name.to_ident(),
        self.name.to_delete_trig_ident()
      ),
      None => format!("\"cfsql_del_trig__{}\"", self.name.0),
    }
  }

  fn to_patch_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("{}.{}", db_name.to_ident(), self.name.to_patch_trig_ident()),
      None => format!("\"cfsql_patch_trig__{}\"", self.name.0),
    }
  }
}

impl NameExt for Name {
  fn to_ident(&self) -> String {
    format!("\"{}\"", self.0)
  }

  fn to_view_ident(&self) -> String {
    NameExt::to_ident(self)
  }

  fn to_patch_view_ident(&self) -> String {
    format!("\"cfsql_patch__{}\"", self.0)
  }

  fn to_crr_table_ident(&self) -> String {
    format!("\"cfsql_crr__{}\"", self.0)
  }

  fn to_crr_clock_table_ident(&self) -> String {
    format!("\"cfsql_clock__{}\"", self.0)
  }

  fn to_insert_trig_ident(&self) -> String {
    format!("\"cfsql_ins_trig__{}\"", self.0)
  }

  fn to_update_trig_ident(&self) -> String {
    format!("\"cfsql_up_trig__{}\"", self.0)
  }

  fn to_delete_trig_ident(&self) -> String {
    format!("\"cfsql_del_trig__{}\"", self.0)
  }

  fn to_patch_trig_ident(&self) -> String {
    format!("\"cfsql_patch_trig__{}\"", self.0)
  }
}

impl CreateTableBodyExt for CreateTableBody {
  fn non_crr_columns(&self) -> Result<Vec<&ColumnDefinition>, &'static str> {
    match self {
      Self::ColumnsAndConstraints {
        columns,
        constraints,
        options,
      } => Ok(
        columns
          .iter()
          .filter(|x| !x.col_name.0.contains("cfsql"))
          .collect::<Vec<_>>(),
      ),
      _ => Err("table creation from select is not supported for crr creation"),
    }
  }
}

impl ColumnDefinitionExt for ColumnDefinition {
  fn is_primary_key(&self) -> bool {
    self.constraints.iter().any(|c| match c.constraint {
      ColumnConstraint::PrimaryKey { .. } => true,
      _ => false,
    })
  }
}

pub struct WrapForDisplay<T: ToTokens> {
  pub val: T,
}

impl<T: ToTokens> Display for WrapForDisplay<T> {
  fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
    self.val.to_fmt(f)
  }
}

pub fn to_string<T: ToTokens>(x: T) -> String {
  format!("{}", WrapForDisplay { val: x })
}

pub fn wrap_for_display<T: ToTokens>(x: T) -> WrapForDisplay<T> {
  WrapForDisplay { val: x }
}
