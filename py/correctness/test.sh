#!/usr/bin/env bash

source env/bin/activate
python -m pytest tests -s -k test_prior_versions

# -k test_sync_prop.py
