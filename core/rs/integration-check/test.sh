#!/usr/bin/env bash

mv ../bundle/Cargo.toml ../bundle/Cargo.toml.bk
mv ../bundle/Cargo.toml.integration-test ../bundle/Cargo.toml
cargo $1 test
mv ../bundle/Cargo.toml ../bundle/Cargo.toml.integration-test 
mv ../bundle/Cargo.toml.bk ../bundle/Cargo.toml
