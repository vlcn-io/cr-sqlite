from crsql_correctness import connect, close, min_db_v
from pprint import pprint
import pytest
import time

def test_commit_alter_perf():
  c = connect(":memory:")
  c.execute("CREATE TABLE issue (id INTEGER PRIMARY KEY NOT NULL, title TEXT, owner TEXT, status INTEGER, priority INTEGER)")
  c.execute("SELECT crsql_as_crr('issue')")
  c.commit()

  start_time = time.time()
  for i in range(10_000):
    c.execute("INSERT INTO issue (title, owner, status, priority) VALUES ('title', 'owner', 1, 1)")
  c.commit()
  end_time = time.time()
  print(f"insert time: {end_time - start_time}")

  start_time = time.time()
  c.execute("SELECT crsql_begin_alter('issue')")
  c.execute("SELECT crsql_commit_alter('issue')")
  end_time = time.time()
  print(f"no alter alter time: {end_time - start_time}")

  start_time = time.time()
  c.execute("SELECT crsql_begin_alter('issue')")
  c.execute("ALTER TABLE issue ADD COLUMN description TEXT")
  c.execute("SELECT crsql_commit_alter('issue')")
  end_time = time.time()
  print(f"alter add col time: {end_time - start_time}")

  None