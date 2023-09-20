from crsql_correctness import connect, close
from pprint import pprint


def setup_db():
    c = connect(":memory:")
    c.execute("CREATE TABLE item (id PRIMARY KEY NOT NULL, x INTEGER, y INTEGER, desc TEXT)")
    c.execute("SELECT crsql_as_crr('item')")
    c.commit()

    c.execute("INSERT INTO item VALUES (123, 0, 0, 'The bestest thing')")
    c.execute("INSERT INTO item VALUES (321, 10, 10, 'The okest thing')")
    c.commit()

    c.execute("UPDATE item SET x = 1000 WHERE id = 123")
    c.execute("INSERT INTO item VALUES (411, -1, -1, 'The worst thing')")
    c.commit()

    c.execute("DELETE FROM item WHERE id = 411")
    c.commit()

    return (c, c.execute(changes_query + " ORDER BY db_version, seq ASC").fetchall())


changes_query = "SELECT [table], pk, cid, val, col_version, db_version, site_id, seq FROM crsql_changes"
col_mapping = {
    'table': 0,
    'pk': 1,
    'cid': 2,
    'val': 3,
    'col_version': 4,
    'db_version': 5,
    'site_id': 6,
    'seq': 7
}

operations = [
    ['<', lambda x, y: x < y],
    ['>', lambda x, y: x > y],
    ['=', lambda x, y: False if x is None or y is None else x == y],
    ['!=', lambda x, y: False if x is None or y is None else x != y],
    ['IS', lambda x, y: x == y],
    ['IS NOT', lambda x, y: x != y]
]


def run_test(constraint, operation_subset=None, range=range(5)):
    (c, all_changes) = setup_db()

    for x in range:
        for (opcode, predicate) in operations:
            if operation_subset is None or opcode in operation_subset:
                tbl_changes = c.execute(
                    changes_query + " WHERE [{}] {} ? ORDER BY db_version, seq ASC".format(constraint, opcode), (x, )).fetchall()
                mnl_changes = list(
                    filter(lambda row: predicate(row[col_mapping[constraint]], x), all_changes))
                assert (tbl_changes == mnl_changes)

    close(c)


def test_dbversion_filter():
    run_test("db_version")


def test_seq_filter():
    run_test("seq")


def test_cid_filter():
    run_test("cid", {'=', '!='})


def test_table_filter():
    run_test("table", {'=', '!='})


def test_col_version_filter():
    run_test("col_version")


# TODO: pks should be returned as their actual type. . .
# well we can't exactly do this since primary keys must be concatenated into a single
# column. Maybe if there is only 1 primary key we can optimize for that case?
def test_pk_filter():
    run_test("pk", {'=', '!='}, ['123', '321', '411'])


def test_site_id_filter():
    run_test('site_id', {'=', '!=', 'IS', 'IS NOT'}, [None])


# TODO: val filter should return `any` type to match the original
# value type of the underlying storage rather than a stringified version
# def test_val_filter():
#     run_test("val")
