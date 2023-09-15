sed -i .bk 's/crate-type = \["staticlib"\]/crate-type = \["rlib"\]/' ../bundle/Cargo.toml
cargo test
mv ../bundle/Cargo.toml.bk ../bundle/Cargo.toml