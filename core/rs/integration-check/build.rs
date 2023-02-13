use cc;
use std::env;
use std::process::Command;

fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();

    Command::new("make")
        .current_dir("../../")
        .arg("loadable")
        .status()
        .expect("failed to make loadable extension");

    cc::Build::new()
        .file("../../src/sqlite/sqlite3.c")
        //.include("sqlite3/sqlite3ext.h")
        .include("../../src/sqlite/sqlite3.h")
        .flag("-DSQLITE_CORE")
        .compile("sqlite3");

    println!("cargo:rustc-link-search=native={}", out_dir);
    println!("cargo:rustc-link-lib=static=sqlite3");
}
