use cc;
use std::env;
use std::process::Command;

fn main() {
    Command::new("make")
        .current_dir("../../")
        .arg("loadable")
        .status()
        .expect("failed to make loadable extension");

    cc::Build::new()
        .file("../../src/sqlite/sqlite3.c")
        .include("../../src/sqlite/sqlite3.h")
        .flag("-DSQLITE_CORE")
        .compile("sqlite3");
}
