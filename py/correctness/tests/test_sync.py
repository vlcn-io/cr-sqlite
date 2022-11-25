from crsql_correctness import connect, close, min_db_v
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

  c.execute("select crsql_as_crr('user')")
  c.execute("select crsql_as_crr('deck')")
  c.execute("select crsql_as_crr('slide')")
  c.execute("select crsql_as_crr('component')")

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

def update_data(c):
  c.execute("UPDATE user SET name = 'Maestro' WHERE id = 1")
  c.execute("UPDATE deck SET title = 'Presto' WHERE id = 1")
  c.execute("COMMIT")

def delete_data(c):
  c.execute("DELETE FROM component WHERE id = 1")
  c.execute("COMMIT")

def get_changes_since(c, version, requestor):
  return c.execute(
    "SELECT * FROM crsql_changes WHERE version > {v} AND site_id != {r}".format(v=version, r=requestor)
  ).fetchall()

def apply_patches():
  return 1

def test_changes_since():
  dbs = init()

  rows = get_changes_since(dbs[0], 0, -1)
  siteid = dbs[0].execute("select crsql_siteid()").fetchone()[0]
  expected = [("component", "1", "content", "'wootwoot'", 1, siteid),
    ("component", "1", "slide_id", "1", 1, siteid),
    ("component", "1", "type", "'text'", 1, siteid),
    ("component", "2", "content", "'toottoot'", 1, siteid),
    ("component", "2", "slide_id", "1", 1, siteid),
    ("component", "2", "type", "'text'", 1, siteid),
    ("component", "3", "content", "'footfoot'", 1, siteid),
    ("component", "3", "slide_id", "1", 1, siteid),
    ("component", "3", "type", "'text'", 1, siteid),
    ("deck", "1", "owner_id", "1", 1, siteid),
    ("deck", "1", "title", "'Preso'", 1, siteid),
    ("slide", "1", "deck_id", "1", 1, siteid),
    ("slide", "1", "order", "0", 1, siteid),
    ("slide", "2", "deck_id", "1", 1, siteid),
    ("slide", "2", "order", "1", 1, siteid),
    ("slide", "3", "deck_id", "1", 1, siteid),
    ("slide", "3", "order", "2", 1, siteid),
    ("user", "1", "name", "'Javi'", 1, siteid)]

  assert(rows == expected)

  update_data(dbs[0])

  rows = get_changes_since(dbs[0], 1, -1)

  assert(rows == [('deck', '1', 'title', "'Presto'", 2, siteid), ('user', '1', 'name', "'Maestro'", 2, siteid)]);

def test_delete():
  db = connect(":memory:")
  create_schema(db)
  insert_data(db)

  delete_data(db)

  rows = get_changes_since(db, 1, -1)
  siteid = db.execute("select crsql_siteid()").fetchone()[0]
  # Deletes are marked with a sentinel id
  assert(rows == [('component', '1', '__crsql_del', None, 2, siteid)]);

  db.execute("DELETE FROM component")
  db.execute("DELETE FROM deck")
  db.execute("DELETE FROM slide")
  db.execute("COMMIT")

  rows = get_changes_since(db, 0, -1)
  # TODO: we should have the network layer collapse these events or do it ourselves.
  # given we have past events that we're missing data for, they're now marked off as deletes
  # TODO: should deletes not get a proper version? Would be better for ordering and chunking replications
  assert(rows == [
    ("component", "1", "__crsql_del", None, 1, siteid),
    ("component", "1", "__crsql_del", None, 1, siteid),
    ("component", "1", "__crsql_del", None, 1, siteid),
    ("component", "2", "__crsql_del", None, 1, siteid),
    ("component", "2", "__crsql_del", None, 1, siteid),
    ("component", "2", "__crsql_del", None, 1, siteid),
    ("component", "3", "__crsql_del", None, 1, siteid),
    ("component", "3", "__crsql_del", None, 1, siteid),
    ("component", "3", "__crsql_del", None, 1, siteid),
    ("deck", "1", "__crsql_del", None, 1, siteid),
    ("deck", "1", "__crsql_del", None, 1, siteid),
    ("slide", "1", "__crsql_del", None, 1, siteid),
    ("slide", "1", "__crsql_del", None, 1, siteid),
    ("slide", "2", "__crsql_del", None, 1, siteid),
    ("slide", "2", "__crsql_del", None, 1, siteid),
    ("slide", "3", "__crsql_del", None, 1, siteid),
    ("slide", "3", "__crsql_del", None, 1, siteid),
    ("user", "1", "name", "'Javi'", 1, siteid),
    ("component", "1", "__crsql_del", None, 2, siteid),
    ("component", "2", "__crsql_del", None, 3, siteid),
    ("component", "3", "__crsql_del", None, 3, siteid),
    ("deck", "1", "__crsql_del", None, 3, siteid),
    ("slide", "1", "__crsql_del", None, 3, siteid),
    ("slide", "2", "__crsql_del", None, 3, siteid),
    ("slide", "3", "__crsql_del", None, 3, siteid)]);

  # test insert

  # test pk only row(s)

  # test no change insert (settings values to what they were before)

  # test new table after a call to get_changes_since
  close(db)

def test_merge():
  dbs = init()

  dbs[0].execute("UPDATE deck SET title = 'a' WHERE id = 1")
  dbs[1].execute("UPDATE deck SET title = 'b' WHERE id = 1")
  dbs[2].execute("UPDATE deck SET title = 'c' WHERE id = 1")

  


  for c in dbs:
    close(c)


  # test delete
  # test pk only
  # test create
  # test update
