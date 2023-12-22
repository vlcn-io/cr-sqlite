from crsql_correctness import connect, close, get_site_id
import pprint

def test_config_merge_equal_values():
    db = connect(":memory:")
    value = db.execute("SELECT crsql_config_set('merge-equal-values', 1);").fetchone()
    assert (value == (1,))
    db.commit()

    value = db.execute("SELECT value FROM crsql_master WHERE key = 'config.merge-equal-values'").fetchone()
    assert (value == (1,))

    value = db.execute("SELECT crsql_config_get('merge-equal-values');").fetchone()
    assert (value == (1,))