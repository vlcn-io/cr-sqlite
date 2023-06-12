from crsql_correctness import connect, close, min_db_v
import shutil
from pprint import pprint


def test_can_load_v0_12_0():
    prefix = "./prior-dbs/v0.12.0"
    # copy the file given connecting might migrate it!
    shutil.copyfile(prefix + ".prior-db", prefix + ".db")
    c = connect(prefix + ".db")
    rows = c.execute("SELECT * FROM crsql_changes").fetchall()
    pprint.pprint(rows)
