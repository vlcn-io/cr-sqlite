from crsql_correctness import connect, min_db_v

def test_c1_c2_c3_c4_c6_c7_crr_values():
  c = connect(":memory:")
  init_version = c.execute("SELECT crsql_dbversion()").fetchone()[0]
  c.execute("create table foo (id primary key, a)")
  c.execute("select crsql_as_crr('foo')")

  c.execute("insert into foo values(1, 2)")
  c.commit()

  row = c.execute("select id, __crsql_col_num, __crsql_version, __crsql_site_id from foo__crsql_clock").fetchone()
  assert row[0] == 1
  assert row[1] == 1
  assert row[2] == init_version + 1
  assert row[3] == None
  new_version = c.execute("SELECT crsql_dbversion()").fetchone()[0]

  assert new_version == init_version + 1

  clock_rows = c.execute("select * from foo__crsql_clock").fetchall()
  assert len(clock_rows) == 1

  row = c.execute("select id, a from foo").fetchone()
  assert row[0] == 1
  assert row[1] == 2

  new_version = c.execute("SELECT crsql_dbversion()").fetchone()[0]

  assert new_version == init_version + 1

