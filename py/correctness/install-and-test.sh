#!/usr/bin/env bash

source env/bin/activate
python3 -m pip install -r requirements.txt
python3 -m pytest tests
