use cc;
use std::process::Command;

fn main() {
    Command::new("make")
        .current_dir("../../")
        .arg("./dist/sqlite3-extra.c")
        .status()
        .expect("failed to make sqlite3-extra.c");

    cc::Build::new()
        .files(vec![
            "../../src/changes-vtab.c",
            "../../src/crsqlite.c",
            "../../src/ext-data.c",
        ])
        .include("../../src")
        .compile("crsqlite");

    cc::Build::new()
        .file("../../dist/sqlite3-extra.c")
        .include("../../src/sqlite/")
        .include("../../src")
        .flag("-DSQLITE_CORE")
        .flag("-DSQLITE_EXTRA_INIT=core_init")
        .flag("-DSQLITE_OMIT_LOAD_EXTENSION=1")
        .flag("-DSQLITE_THREADSAFE=0")
        .compile("sqlite3");
}
