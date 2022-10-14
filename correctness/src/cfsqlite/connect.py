import sqlite3

def connect(db_file, extension):
  c = sqlite3.connect(db_file)
  c.enable_load_extension(True)
  c.load_extension(extension)
  return c