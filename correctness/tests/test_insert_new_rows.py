from cfsql_correctness import connect

def test_c1_c2_c3_c4_c6_c7_crr_values():
  c = connect(":memory:")
  init_version = c.execute("SELECT cfsql_dbversion()").fetchone()[0]
  c.execute("select cfsql('create table foo (id primary key, a)')")

  c.execute("insert into foo values(1, 2)")
  c.commit()

  row = c.execute("select a__cfsql_v, __cfsql_cl, __cfsql_src from foo__cfsql_crr").fetchone()
  assert row[0] == 0
  assert row[1] == 1
  assert row[2] == 0
  new_version = c.execute("SELECT cfsql_dbversion()").fetchone()[0]

  assert new_version == init_version + 1

  clock_rows = c.execute("select id, __cfsql_site_id, __cfsql_version from foo__cfsql_clock").fetchall()
  assert len(clock_rows) == 1

  site_id = c.execute("select cfsql_siteid()").fetchone()[0]
  assert clock_rows[0][1] == site_id
  # return clock was for inserted row -- id 1
  assert clock_rows[0][0] == 1
  assert clock_rows[0][2] == new_version

  row = c.execute("select id, a from foo").fetchone()
  assert row[0] == 1
  assert row[1] == 2

