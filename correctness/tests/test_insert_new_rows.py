from cfsql_correctness import connect, min_db_v

def test_c1_c2_c3_c4_c6_c7_crr_values():
  c = connect(":memory:")
  init_version = c.execute("SELECT cfsql_dbversion()").fetchone()[0]
  c.execute("create table foo (id primary key, a)")
  c.execute("select cfsql_crr_from('foo')")

  c.execute("insert into foo values(1, 2)")
  c.commit()

  row = c.execute("select id, __cfsql_col_num, __cfsql_version, __cfsql_site_id from foo__cfsql_clock").fetchone()
  assert row[0] == 1
  assert row[1] == 1
  # + 2 -- +1 for insert, +1 for create table
  assert row[2] == init_version + 2
  assert row[3] == 0
  new_version = c.execute("SELECT cfsql_dbversion()").fetchone()[0]

  assert new_version == init_version + 3

  clock_rows = c.execute("select * from foo__cfsql_clock").fetchall()
  assert len(clock_rows) == 1

  row = c.execute("select id, a from foo").fetchone()
  assert row[0] == 1
  assert row[1] == 2

  new_version = c.execute("SELECT cfsql_dbversion()").fetchone()[0]

  assert new_version == init_version + 3

