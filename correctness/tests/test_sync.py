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

  assert(rows == [('component', '1', 1, "'text'", 1, None),
 ('component', '1', 2, '1', 1, None),
 ('component', '1', 3, "'wootwoot'", 1, None),
 ('component', '2', 1, "'text'", 1, None),
 ('component', '2', 2, '1', 1, None),
 ('component', '2', 3, "'toottoot'", 1, None),
 ('component', '3', 1, "'text'", 1, None),
 ('component', '3', 2, '1', 1, None),
 ('component', '3', 3, "'footfoot'", 1, None),
 ('deck', '1', 1, '1', 1, None),
 ('deck', '1', 2, "'Preso'", 1, None),
 ('slide', '1', 1, '1', 1, None),
 ('slide', '1', 2, '0', 1, None),
 ('slide', '2', 1, '1', 1, None),
 ('slide', '2', 2, '1', 1, None),
 ('slide', '3', 1, '1', 1, None),
 ('slide', '3', 2, '2', 1, None),
 ('user', '1', 1, "'Javi'", 1, None)])

  update_data(dbs[0])

  rows = get_changes_since(dbs[0], 1, -1)

  assert(rows == [('deck', '1', 2, "'Presto'", 2, None), ('user', '1', 1, "'Maestro'", 2, None)]);

def test_delete():
  db = connect(":memory:")
  create_schema(db)
  insert_data(db)

  delete_data(db)

  rows = get_changes_since(db, 1, -1)
  # Deletes are marked with a sentinel id
  assert(rows == [('component', '1', -1, None, 0, None)]);

  db.execute("DELETE FROM component")
  db.execute("DELETE FROM deck")
  db.execute("DELETE FROM slide")
  db.execute("COMMIT")

  rows = get_changes_since(db, 0, -1)
  # TODO: we should have the network layer collapse these events or do it ourselves.
  # given we have past events that we're missing data for, they're now marked off as deletes
  # TODO: should deletes not get a proper version? Would be better for ordering and chunking replications
  assert(rows == [('component', '1', -1, None, 0, None),
 ('component', '1', -1, None, 0, None),
 ('component', '1', -1, None, 0, None),
 ('component', '2', -1, None, 0, None),
 ('component', '2', -1, None, 0, None),
 ('component', '2', -1, None, 0, None),
 ('component', '3', -1, None, 0, None),
 ('component', '3', -1, None, 0, None),
 ('component', '3', -1, None, 0, None),
 ('deck', '1', -1, None, 0, None),
 ('deck', '1', -1, None, 0, None),
 ('slide', '1', -1, None, 0, None),
 ('slide', '1', -1, None, 0, None),
 ('slide', '2', -1, None, 0, None),
 ('slide', '2', -1, None, 0, None),
 ('slide', '3', -1, None, 0, None),
 ('slide', '3', -1, None, 0, None),
 ('user', '1', 1, "'Javi'", 1, None),
 ('component', '1', -1, None, 1, None),
 ('component', '2', -1, None, 1, None),
 ('component', '3', -1, None, 1, None),
 ('deck', '1', -1, None, 1, None),
 ('slide', '1', -1, None, 1, None),
 ('slide', '2', -1, None, 1, None),
 ('slide', '3', -1, None, 1, None)]);

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
