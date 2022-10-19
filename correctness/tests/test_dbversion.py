import pathlib
from cfsql_correctness import connect, min_db_v

def test_c1_min_on_init():
  c = connect(":memory:")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v

def test_c2_increments():
  c = connect(":memory:")
  c.execute("create table foo (id primary key, a)")
  c.execute("insert into foo values (1, 2)")
  c.execute("commit")
  # +2 since create table statements bump version too
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 2
  c.execute("update foo set a = 3 where id = 1")
  c.execute("commit")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 3
  c.execute("delete from foo where id = 1")
  c.execute("commit")
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 4

def test_c3_restored():
  dbfile = "./dbversion_c3.db"
  pathlib.Path(dbfile).unlink(missing_ok=True)
  c = connect(dbfile)

  # C3
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v

  # close and re-open to check that we work with empty clock tables
  c.execute("create table foo (id primary key, a)")
  c.execute("select cfsql_as_crr('foo')")
  c.close()
  c = connect(dbfile)
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v

  # insert so we get a clock entry
  c.execute("insert into foo values (1, 2)")
  c.commit()
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 1

  # Close and reopen to check that version was persisted and re-initialized correctly
  c.close()
  c = connect(dbfile)
  print(c.execute("select * from foo").fetchall())
  assert c.execute("SELECT cfsql_dbversion()").fetchone()[0] == min_db_v + 1

  # # C4 -- untested
  # c.close()
