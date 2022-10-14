from cfsql_correctness import connect
import pytest

def test_c1_4():
  c = connect(":memory:")
  c.execute("select cfsql('create table foo (a)')")

  # Just expecting these not to throw
  c.execute("SELECT rowid, a FROM foo").fetchall()
  c.execute("SELECT rowid, a, a__cfsql_v, __cfsql_cl, __cfsql_src FROM foo__cfsql_crr").fetchall()

def test_c1_3():
  c = connect(":memory:")
  c.execute("select cfsql('create table \"foo\" (a)')")
  c.execute("select cfsql('create table `bar` (a)')")
  c.execute("select cfsql('create table [baz] (a)')")

  check_view = lambda t : c.execute("SELECT rowid, a FROM {t}".format(t=t)).fetchall()
  check_crr = lambda t : c.execute("SELECT rowid, a, a__cfsql_v, __cfsql_cl, __cfsql_src FROM {t}__cfsql_crr".format(t=t)).fetchall()

  check_view("foo")
  check_crr("foo")
  check_view("bar")
  check_crr("bar")
  check_view("baz")
  check_crr("baz")

def test_c1_c5():
  c = connect(":memory:")
  # TODO: this was a silent failure when `create` as typod
  c.execute("select cfsql('create table foo (a, b, c, primary key (a, b))')")

  c.execute("SELECT a, b, c, c__cfsql_v, __cfsql_cl, __cfsql_src FROM foo__cfsql_crr").fetchall()
  # with pytest.raises(Exception) as e_info:
      # c.execute("SELECT a__cfsql_v FROM foo__cfsql_crr").fetchall()

def test_c1_6():
  c = connect(":memory:")
  c.execute("select cfsql('create table foo (a, b, c, primary key (a))')")
  c.execute("SELECT a, b, b__cfsql_v, c, c__cfsql_v, __cfsql_cl, __cfsql_src FROM foo__cfsql_crr").fetchall()

