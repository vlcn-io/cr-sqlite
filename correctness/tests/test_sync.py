from cfsql_correctness import connect, min_db_v

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

def test_changes_since():
  dbs = init()
  c = dbs[0]
  clock_tables = c.execute("SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name LIKE '%__cfsql_clock'").fetchall()

  print(clock_tables)

  # the extension will need to get table info for the clock tables
  # and extract pk columns to quote-concat as pk. ~'~
  format_str = "SELECT quote(id) as pk, json_group_object(\"__cfsql_col_num\", \"__cfsql_version\") as col_vs, max(rowid) as rid FROM {tbl}__cfsql_clock WHERE __cfsql_site_id != ? AND __cfsql_version > ? GROUP BY pk"
  unions = [
    format_str.format(tbl="user"),
    format_str.format(tbl="deck"),
    format_str.format(tbl="slide"),
    format_str.format(tbl="component"),
  ]

  for u in unions:
    r = c.execute(u, ("to-use-real-site-id", min_db_v)).fetchall()
    print(r)
  
  "SELECT pk, col_vs, rid FROM () WHERE "

  # for row in clock_tables:
    # Each table needs special case handling to correctly pull primary keys
    # unions.append("SELECT __cfsql_version as version, __cfsql_col_num as cid, ")

  return 1

def test_patch():
  # ..
  return 1