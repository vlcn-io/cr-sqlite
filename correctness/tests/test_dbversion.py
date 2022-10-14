import sqlite3
import pathlib

db_file = './analyze/correctness.db'
extension = './dist/cfsqlite'
min_db_v = -9223372036854775807

pathlib.Path(db_file).unlink(missing_ok=True)

def connect(file):
  c = sqlite3.connect(file)
  c.enable_load_extension(True)
  c.load_extension(extension)
  return c

def test_c1():
  c = connect(":memory:")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v

def test_c2():
  c = connect(":memory:")
  c.execute("select cfsql('create table foo (id primary key, a)')")
  c.execute("insert into foo values (1, 2)");
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 1
  c.execute("update foo set a = 3 where id = 1")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 2
  c.execute("delete from foo where id = 1")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 3

def test_c3():
  1
  # c = connect()

  # # C3
  # print(c.execute("SELECT cfsql_dbversion()").fetchone()[0])
  # assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 3

  # # C4 -- untested
  # c.close()
