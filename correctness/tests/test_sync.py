from cfsql_correctness import connect, min_db_v
import pprint

# Using this to prototype sync rather than test it.

def init():
  dbs = list(map(lambda c: connect(":memory:"), range(3)))

  for db in dbs:
    create_schema(db)
  
  for db in dbs:
    insert_data(db)

  return dbs

def create_schema(c):
  c.execute("CREATE TABLE \"user\" (id primary key, name)")
  c.execute("CREATE TABLE deck (id primary key, owner_id, title)")
  c.execute("CREATE TABLE slide (id primary key, deck_id, \"order\")")
  c.execute("CREATE TABLE component (id primary key, type, slide_id, content)")

  c.execute("select cfsql_crr_from('user')")
  c.execute("select cfsql_crr_from('deck')")
  c.execute("select cfsql_crr_from('slide')")
  c.execute("select cfsql_crr_from('component')")

def insert_data(c):
  c.execute("INSERT INTO user VALUES (1, 'Javi')")
  c.execute("INSERT INTO deck VALUES (1, 1, 'Preso')")

  c.execute("INSERT INTO slide VALUES (1, 1, 0)")
  c.execute("INSERT INTO component VALUES (1, 'text', 1, 'wootwoot')")
  c.execute("INSERT INTO component VALUES (2, 'text', 1, 'toottoot')")
  c.execute("INSERT INTO component VALUES (3, 'text', 1, 'footfoot')")

  c.execute("INSERT INTO slide VALUES (2, 1, 1)")
  c.execute("INSERT INTO slide VALUES (3, 1, 2)")

  c.execute("COMMIT")

def get_changes_since(db, version, requestor):
  return 1

def test_changes_since():
  pp = pprint.PrettyPrinter(indent=2)
  dbs = init()
  c = dbs[0]
  clock_tables = c.execute("SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__cfsql_clock'").fetchall()

  print(clock_tables)

  # the extension will need to get table info for the clock tables
  # and extract pk columns to quote-concat as pk. ~'~
  format_str = "SELECT quote(id) as pk, '{tbl}' as tbl, json_group_object(\"__cfsql_col_num\", \"__cfsql_version\") as col_vs, max(rowid) as rid FROM {tbl}__cfsql_clock WHERE __cfsql_site_id != x'{siteid}' AND __cfsql_version > {vers} GROUP BY pk"
  unions = [
    format_str.format(tbl="user", vers=min_db_v, siteid="FF"), # TODO: get the actual site id
    format_str.format(tbl="deck", vers=min_db_v, siteid="FF"),
    format_str.format(tbl="slide", vers=min_db_v, siteid="FF"),
    format_str.format(tbl="component", vers=min_db_v, siteid="FF"),
  ]
  
  complete_query = "SELECT tbl, pk, rid, col_vs FROM ( {unions} ) ".format(unions=" UNION ".join(unions))

  r = c.execute(complete_query, ()).fetchall()
  pp.pprint(r)

  return 1

def test_patch():
  # unroll each change
  # apply to table if lww rules pass
  # do this in a tx

  # also..
  # may be more easily done against a patch view?

  # Sketch:
  # for each row,
  # select that row's clock entries in the target site
  #
  # compare to figure out what overwrites. Do not use value based ruling rather us
  # version and peer id.
  #
  # Once we know what overwrites, craft an insert query for those columns on that row
  #   this requires table info again given we need to go from cid to name?
  #
  # do comparison against 
  return 1