from cfsql_correctness import connect

def test_c1_4_no_primary_keys():
  c = connect(":memory:")
  c.execute("create table foo (a)")
  c.execute("select cfsql_crr_from('foo')")

  # Just expecting these not to throw
  c.execute("SELECT rowid, a FROM foo").fetchall()
  c.execute("SELECT rowid, __cfsql_version, __cfsql_col_num, __cfsql_site_id FROM foo__cfsql_clock").fetchall()

def test_c1_3_quoted_identifiers():
  c = connect(":memory:")
  c.execute("create table \"foo\" (a)")
  c.execute("select cfsql_crr_from('foo')")
  c.execute("create table `bar` (a)")
  c.execute("select cfsql_crr_from('bar')")
  c.execute("create table [baz] (a)")
  c.execute("select cfsql_crr_from('baz')")

  check_clock = lambda t : c.execute("SELECT rowid, __cfsql_version, __cfsql_col_num, __cfsql_site_id FROM {t}__cfsql_clock".format(t=t)).fetchall()

  check_clock("foo")
  check_clock("bar")
  check_clock("baz")

def test_c1_c5_compound_primary_key():
  c = connect(":memory:")
  # TODO: this was a silent failure when `create` as typoed
  c.execute("create table foo (a, b, c, primary key (a, b))")
  c.execute("select cfsql_crr_from('foo')")

  c.execute("SELECT a, b, __cfsql_version, __cfsql_col_num, __cfsql_site_id FROM foo__cfsql_clock").fetchall()
  # with pytest.raises(Exception) as e_info:
      # c.execute("SELECT a__cfsql_v FROM foo__cfsql_crr").fetchall()

def test_c1_6_single_primary_key():
  c = connect(":memory:")
  c.execute("create table foo (a, b, c, primary key (a))")
  c.execute("select cfsql_crr_from('foo')")
  c.execute("SELECT a, __cfsql_version, __cfsql_col_num, __cfsql_site_id FROM foo__cfsql_clock").fetchall()

def test_c2_create_index():
  c = connect(":memory:")
  c.execute("create table foo (a primary key, b, c)")

  # TODO: create index is silent failing in some cases?
  c.execute("create index foo_idx on foo (b)")
  c.execute("select cfsql_crr_from('foo')")
  idx_info = c.execute("select * from pragma_index_info('foo_idx')").fetchall()

  print(idx_info)