import sqlite3

extension = '../dist/cfsqlite'
def connect(db_file):
  c = sqlite3.connect(db_file)
  c.enable_load_extension(True)
  c.load_extension(extension)
  return c

min_db_v = -9223372036854775807 + 1