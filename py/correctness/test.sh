#!/usr/bin/env bash

# source env/bin/activate
# python -m pytest tests -s -k test_cl_merging
python3 -m pytest tests -s -k test_commit_alter_perf
