use std::fmt::{self, Display, Formatter};

use sqlite3_parser::ast::{CreateTableBody, QualifiedName, ToTokens};

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

pub trait CreateTableBodyExt {
  fn column_name_idents(&self) -> Vec<String>;
}

impl QualifiedNameExt for QualifiedName {
  fn to_view_ident(&self) -> String {
    QualifiedNameExt::to_ident(self)
  }

  fn to_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"{}\"", db_name.0, self.name.0),
      None => format!("\"{}\"", self.name.0),
    }
  }

  fn to_patch_view_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_patch__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_patch__{}\"", self.name.0),
    }
  }

  fn to_crr_table_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_crr__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_crr__{}\"", self.name.0),
    }
  }

  fn to_crr_clock_table_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_clock__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_clock__{}\"", self.name.0),
    }
  }

  fn to_insert_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_ins_trig__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_ins_trig__{}\"", self.name.0),
    }
  }

  fn to_update_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_up_trig__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_up_trig__{}\"", self.name.0),
    }
  }

  fn to_delete_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_del_trig__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_del_trig__{}\"", self.name.0),
    }
  }

  fn to_patch_trig_ident(&self) -> String {
    match &self.db_name {
      Some(db_name) => format!("\"{}\".\"cfsql_patch_trig__{}\"", db_name.0, self.name.0),
      None => format!("\"cfsql_patch_trig__{}\"", self.name.0),
    }
  }
}

impl CreateTableBodyExt for CreateTableBody {
  fn column_name_idents(&self) -> Vec<String> {
    return vec![];
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
