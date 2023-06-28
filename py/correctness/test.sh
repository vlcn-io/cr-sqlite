#!/usr/bin/env bash

source env/bin/activate
python -m pytest tests -s -k test_crsql_changes_filters

# -k test_sync_prop.py
