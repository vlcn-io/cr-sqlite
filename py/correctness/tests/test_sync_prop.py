from crsql_correctness import connect, close
from hypothesis import given, settings, example
from hypothesis.strategies import integers, data, booleans, integers, text, floats, uuids, characters, composite
from functools import reduce
import random
import pprint
import uuid

INSERT = 0
UPDATE = 1
DELETE = 2
MAX_SIGNED_32BIT = 2147483647
MIN_SIGNED_32BIT = -2147483648

# CREATE TABLE item (id, width, height, name, description, weight)
COLUMN_TYPES = (
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT),
    text(characters(min_codepoint=0x0020, max_codepoint=0x27BF)),
    text(characters(min_codepoint=0x0020, max_codepoint=0x27BF)),
    # floats seem to be able to lose precision in sync. We need to dig into this!
    integers(MIN_SIGNED_32BIT, MAX_SIGNED_32BIT)
    # -1.1754943508222875e-38 vs
    # -1.1754943508222872e-38 was the failure seen.
    # floats
)

COLUMN_NAMES = (
    "width",
    "height",
    "name",
    "description",
    "weight"
)


@composite
def full_script(draw):
    def create_column_data(which_columns):
        return tuple(None if c == False else draw(COLUMN_TYPES[i]) for i, c in enumerate(which_columns))

    def gen_script_step(x):
        op = draw(integers(0, 2))
        which_columns = (draw(booleans()), draw(booleans()), draw(
            booleans()), draw(booleans()), draw(booleans()))
        should_sync = draw(integers(0, 10)) == 0
        num_peers_to_sync = None
        if should_sync:
            num_peers_to_sync = draw(integers(1, num_dbs))

        if op == INSERT:
            return (op, str(uuid.uuid4()), create_column_data(which_columns), num_peers_to_sync)

        if op == UPDATE:
            # force at least one column to true
            if not any(which_columns):
                temp = list(which_columns)
                temp[0] = True
                which_columns = tuple(temp)
            return (op, create_column_data(which_columns), num_peers_to_sync)

        # DELETE
        return (op, num_peers_to_sync)

    def make_script(x):
        length = draw(integers(0, 100))
        return list(map(gen_script_step, range(length)))

    num_dbs = draw(integers(2, 5))
    scripts = list(map(make_script, range(num_dbs)))
    total_steps = reduce(lambda l, r: l + len(r), scripts, 0)

    return (num_dbs, scripts, total_steps)


# @reproduce_failure('6.75.9', b'AXicY2BWYxgF5AMANDEAKg==')
@settings(deadline=None)
@given(full_script())
@example(all_scripts=(2,
                      [
                          [(2, None),
                           (2, None),
                              (0,
                           'c4fc5bef-5bd6-4998-a1dc-cddd3775a4b6',
                               (None, None, None, None, None),
                               None),
                              (0,
                           '55766841-2684-4637-850c-72113abb894f',
                               (None, 55264787, '', '¨ၑ¹²ۡ\x8aĀᖴ✠9Îr', -48),
                               None),
                              (2, None),
                              (2, None),
                              (0,
                           '519124e3-2d57-44ee-8ba1-5eb56dec07eb',
                               (None, None, 'ƿ', 'ᛛD', None),
                               None),
                              (2, 2),
                              (2, None),
                              (1, (None, None, '\x92', 'ᾄ⑷', 1773345835), None),
                              (2, None),
                              (1, (-1356970686, -240387832,
                               '¾Ö¨,ē', None, 13770), None),
                              (1, (None, None, '\x9fឱÃ', 'ñ¾ÆÉÍ\x95ᵐḫ', None), None),
                              (0,
                           '3f448d39-d517-4a26-8302-5e8068b01726',
                               (None, -75, None, None, None),
                               None),
                              (0,
                           '01736467-ae89-4096-81e2-fcb2a7c46199',
                               (None, None, None, '÷⏜©ۡ=\x95ẇÐÂ', -206),
                               None),
                              (2, None),
                              (1, (None, -156, None, None, 26649), None),
                              (1, (1170352786, 809937928, '', '', None), None),
                              (2, None),
                              (0,
                           '55bd9c67-0e01-4518-977f-52cf56fcb8f2',
                               (-48, None, None, 'r', None),
                               None),
                              (1, (-42, 110521859, None, '2ୟ', 227), 2),
                              (1, (None, 30, None, None, None), None),
                              (2, None),
                              (2, None),
                              (0,
                           'ffd0822e-8991-453f-adb1-d3c88a167851',
                               (None, None, 'ᄰorB:ৱº2s', None, 34),
                               None),
                              (2, None),
                              (0,
                           '39386425-e82e-4778-adf2-e5984ce8ea1a',
                               (None, None, None, None, None),
                               None),
                              (0,
                           '37a4c3cd-1457-4035-9d24-55adf2bca6d1',
                               (None, None, '̙òÑ¬ò', 'H', 206),
                               None),
                              (0,
                           '8704c884-1a03-4135-af58-9ba99def1619',
                               (-1683, 2147483647, 'ᖩõཡQìä࿏\x95',
                                '∃£\u0a65ॺĚ\x99ø', None),
                               None),
                              (2, None),
                              (0,
                           '5ccc7c27-9191-4ff8-a666-b5dca16ae995',
                               (-14084, 255, 'ć\x8eǄ', None, None),
                               None),
                              (2, None),
                              (0,
                           'b3d417da-10b3-47f7-b7d8-9404476c0cd8',
                               (None, 14831, 'øF', 'JL\x82', None),
                               None),
                              (2, None),
                              (2, None),
                              (0,
                           'd8fcb266-6fa9-4a7a-b4a5-29ce689a967d',
                               (39638, None, None, None, None),
                               None),
                              (1, (-20280, None, 'j', '', -16051), None),
                              (1, (None, 2017978214, None, 'ó', 13330), None),
                              (1,
                           (None, -55375, None,
                            '\x91\x80pማ\x84¸¦၀ĖûÃøkA\x95س\u0a55ᛨ', None),
                           None),
                              (2, None),
                              (2, None),
                              (2, None),
                              (2, None),
                              (2, None),
                              (2, None),
                              (1, (None, 370925886, None, 'Oî', None), None),
                              (2, None),
                              (0,
                           '9da81426-75af-4f68-9d1d-16af7f73f508',
                               (-15983, None, '', 'ႍ¶', -16358),
                               None),
                              (2, None),
                              (1, (None, None, None,
                               'Đ¨v⒥¿ຍ¾ᩞÏ᧗\x96|±\x96¦', -2147483648), None),
                              (0,
                           '369950ac-9eba-4ea1-9321-812c9db84eec',
                               (119688326, None, 'ᄦ÷ûÂ☜', None, 54),
                               1),
                              (0,
                           '557058d1-fe4e-43d2-a72a-2c03df7315cd',
                               (-3835, -83, None, None, None),
                               None),
                              (0,
                           '62be734f-b738-4235-8b18-80264e2c94ee',
                               (30323, None, None, None, 867598526),
                               None),
                              (0,
                           'bfa35a22-46ea-4351-94b1-00cc5f05d306',
                               (None, None, None, None, -1572),
                               None),
                              (1, (-6892, 1090134077, '>Í¥þᾙ´\x9e$SᖟᅘĘ', 'R♲', None), None),
                              (1, (None, 40683, 'ĐᙥࢁÊñ5֎ßZ♖čÚ≠S¹ą',
                               'ðð×H²z℠Û¯ᔅ', None), 1),
                              (1, (None, None, '', '', 22578), 1),
                              (1, (None, -7522, None, None, -205), None),
                              (0,
                           '451fdb04-e506-4da3-85cc-4ccf3daf81e4',
                               (None, None, None, None, -246311582),
                               None),
                              (2, None),
                              (1, (-9798, 53065, '\x9d', '9⒇ú߇¼ï`ࡥ', -36458), None),
                              (2, None),
                              (2, None),
                              (0,
                           'fb82dd71-b893-40ec-a2dc-c73467db0338',
                               (14244, 63922, 'ê', None, None),
                               None),
                              (1, (-109115235, -1489736205, 'Óᶄ', '', -42055), None),
                              (1, (29338, None, None, '೩سöÞÚ\xa0Ñ.', -19787), None),
                              (1,
                           (57517, None, 'F♃ቐè²ï¢ÈõIºċFᜭđíV@౭Ğ\x82ᖫ',
                            ',¥ᓡĘìTOÒྍ', None),
                           None)],
                          [(0,
                            '5fa61539-d88e-4187-84ea-f8510c921879',
                            (241, None, '', None, 49112),
                              None),
                           (2, None),
                           (1, (-23066, None, '\x98Cb\x98¡uⓠ', None, None), None),
                           (1, (None, None, 'ධ', None, 56408), None),
                           (0,
                           '09247cba-c203-488b-92b5-b74941b82f2e',
                            (None, None, None, None, None),
                              None),
                           (1, (6862, -23815, 'ᓝԌP', 'Ú}\x9fqß²äĈąÏėĀ65ὫĂ²', None), None),
                           (1, (None, None, '°>ÿ↻',
                                'Ệ\x95\x83ëCČ\u1979Āٰ\x8aද', None), None),
                           (0,
                           'fa3ab438-96b4-4e66-875b-0488a17c88c8',
                            (None, 1960569218, 'ᣎoß', 'ĒęᡂĖۮ', -1957823435),
                              None),
                           (0,
                           '556b28ea-66c2-4f4e-b755-d091074f1336',
                            (None, None, None, None, -46827),
                              None),
                           (2, None),
                           (2, 2),
                           (2, None),
                           (1, (None, 209444352, '¹@ᙐ\u05cfà', None, -63174), None),
                           (0,
                           '9d0d3bba-e6e5-4d4e-998b-977ff4966a4f',
                            (None, -766555381, None, '', 18990915),
                              1),
                           (2, None),
                           (1, (-7015, None, 'Ď^\x88', '⑦\u1c8d', None), None),
                           (0,
                           '60c03204-94a7-43c2-b25d-96833dbaba6b',
                            (None, -31, 'ą7⎄', '\x93\x87¤lv\x84:Ć´¡\x95¥õऴ@ĄM', -35585),
                              None),
                           (1, (10141, None, '', None, -1605346305), None),
                           (2, None),
                           (2, None),
                           (2, None),
                           (2, None),
                           (1, (-1314192305, None, None, None, None), None),
                           (2, None),
                           (2, None),
                           (0,
                           '4a45e0c3-eab9-4180-a632-4e02c0a84300',
                            (-1216583752, None, None, None, None),
                              None),
                           (0,
                           'fb856583-bac0-405a-9a07-20538fc47ed2',
                            (25971, None, "Ïi\x88⋍Ē'N", '3', 658594776),
                              None),
                           (1, (None, None, None, 'ਥ\x9bǒZᢋ', -2147483648), None),
                           (0,
                           '050c2501-7dcf-4acb-9b5a-374bb98ced7e',
                            (-1232991027, None, 'ć', None, None),
                              None),
                           (0,
                           '90b07c27-2c12-44c5-92f4-2343bbc0432e',
                            (242, -111, None, '˜`m', None),
                              None),
                           (1, (None, 2083389587, 'નM5Æˋ', None, None), None),
                           (0,
                           '6ed499df-b69a-4126-a892-ae7ac2dde909',
                            (None, None, '1¾␣µࣁÍ\x9bėªᩰ\x9b', '', -62765),
                              None),
                           (1, (-158, 1188914393, 'Piª¤\x8eè', '', None), None),
                           (1, (None, 62185, 'ą', '+', 248), None),
                           (1, (-17, None, 'ñTÄñ¶', 'ñ', -12479), None),
                           (2, None),
                           (1, (None, None, 'e\x92ÎÇ☚\u0ff6½Ⴜзéù',
                            None, 1900610620), None),
                           (0,
                           '64df805d-71fb-4ed3-ba82-ae65011ab1d4',
                            (None, None, '^ªO', None, -1413399612),
                              None),
                           (2, None),
                           (1, (8604, 17692, None, 'ùĊ≭Mª\x9aᓔÝěᗷæʉഹ', None), None),
                           (0,
                           'c9b4efe7-d9ff-457f-901b-2715daaa5874',
                            (61398, 93394634, None, '', 35),
                              None),
                           (1, (-32311, None, None, None, 120), None),
                           (0,
                           '0f54dcca-4a89-4cdb-b711-0fb912027cc8',
                            (None, None, None, None, None),
                              None),
                           (1, (-23754, None, '¢¶', None, -2052577263), None),
                           (2, None),
                           (2, None),
                           (0,
                           '48444dbd-b193-4100-9905-21bfbde82d1d',
                            (None, 175, 'đÃÓ¯ຒ~ඓé',
                             'äÓ\x8dÍଲü\x99ÿk⎱᠑G\xad¦æçۋჽᢻç', None),
                              None),
                           (2, None),
                           (2, None),
                           (2, None),
                           (2, None),
                           (0,
                           'd690d8da-b0d8-4af6-8222-5e93878447c8',
                            (-240, -28061, None, None, 1241525637),
                              None),
                           (1, (None, -252, None, None, None), None),
                           (2, None),
                           (1, (2147483646, -103250500, 'È\x9aÿx', None, -62520), None),
                           (0,
                           '95a1bbee-7861-435f-a892-7d69a3d43a8f',
                            (-135, -2147483648, None, None, -15275),
                              None),
                           (2, None),
                           (0,
                           '3d8808af-fa68-4909-bde1-be4362fe0f7b',
                            (16646, -1933422211, None, None, -27),
                              None),
                           (2, None),
                           (0,
                           'e647d493-a1b9-4fcc-a9ba-72e06e208a2b',
                            (-54747, None, '\x8bR', '&ÿö\x88Ĉ⒟VÍn\x84t', None),
                              None),
                           (0,
                           '28acca09-33cd-48ae-97f2-399e5d653bdf',
                            (None, -226, '\u0380x%\x90พÀ£\u193d°݇',
                             '\x89q\x81', 1228249080),
                              None),
                           (0,
                           '5e37f473-e9f5-489c-9fe4-a463d1051967',
                            (None, -2147483647, 'झ', None, -10165),
                              None),
                           (0,
                           '0faf7d86-d2f8-416f-bfb7-ba08d2098f91',
                            (None, 63730, '\x80ↇ\x88è', None, None),
                              None),
                           (1, (-106, 2147483647, None, None, None), 1),
                           (2, None),
                           (2, None),
                           (1, (None, None, 'ĔÜiÌ\x99', 'ã;č', None), None),
                           (2, None),
                           (2, None),
                           (1, (None, 3032, None, '', -21596), None),
                           (2, None),
                           (2, None),
                           (2, None),
                           (1, (-175, None, '', None, None), None),
                           (1, (None, None, '', None, -1715028079), None),
                           (2, None),
                           (0,
                           '33ccad7f-5a50-4004-ba7e-e7f2cc987927',
                            (20958, None, '\x9aí', None, -1335709186),
                              None),
                           (1, (2147483646, None, None, 'ô°', -180), None),
                           (1, (48, 231, '', '', None), None),
                           (2, None),
                           (2, None),
                           (1, (972269035, 41252, None, None, None), None),
                           (0,
                           '20b6cc59-8d8f-4232-a72b-0cc02c179cfa',
                            (None, 153, None, 'ó0¨e\u20fa\\ð⃐JăbĒVֳÍ\u1776Ú', 63774),
                              None),
                           (0,
                           '38af5d7c-f221-4e0d-bfd8-f22a7051fa10',
                            (None, -154, 'Oᅃôº', 'ğU', -16025),
                              None),
                           (1, (244, None, 'ེ\x9f', 'ÆĖ\x8e9¾¾Č', 2865), None)]],
                      152),)
def test_delta_sync(all_scripts):
    since_is_rowid = False
    # since_is_rowid = data.draw(booleans())
    # todo: expand this test to do many tables. since_is_rowid works after our rowid reversion only because there's a single table.

    def open_db(i):
        conn = connect(":memory:")
        conn.execute(
            "CREATE TABLE item (id PRIMARY KEY, width INTEGER, height INTEGER, name TEXT, description TEXT, weight INTEGER)")
        conn.execute("SELECT crsql_as_crr('item')")
        conn.commit()
        return (i, conn, dict())

    (num_dbs, scripts, total_steps) = all_scripts
    dbs = list(map(open_db, range(num_dbs)))

    for step_index in range(total_steps):
        for db, script in zip(dbs, scripts):
            if step_index >= len(script):
                continue
            maybe_num_peers_to_sync = run_step(db, script[step_index])
            if maybe_num_peers_to_sync is not None:
                sync_from_random_peers(
                    maybe_num_peers_to_sync, db, dbs, since_is_rowid)

    sync_all(dbs, since_is_rowid)

    for i in range(0, len(dbs) - 1):
        conn1 = dbs[i][1]
        conn2 = dbs[i+1][1]

        left_rows = conn1.execute(
            "SELECT * FROM item ORDER BY id ASC").fetchall()
        right_rows = conn2.execute(
            "SELECT * FROM item ORDER BY id ASC").fetchall()

        assert (left_rows == right_rows)
    for db in dbs:
        close(db[1])


def run_step(db, step):
    op = step[0]
    conn = db[1]

    def get_column_names_values(column_data):
        column_values = [x for x in column_data if x is not None]
        column_names = [x for x in list(
            None if column_data[i] is None else name for i, name in enumerate(COLUMN_NAMES)) if x is not None]
        return (column_names, column_values)

    if op == INSERT:
        id = step[1]
        column_data = step[2]

        (column_names, column_values) = get_column_names_values(column_data)
        column_placeholders = ["?" for x in column_values]

        sql = "INSERT INTO item ({}) VALUES ({})".format(
            ", ".join(["id"] + column_names), ", ".join(["?"] + column_placeholders))
        conn.execute(sql, tuple([str(id)] + column_values))
        conn.commit()
        return step[3]
    elif op == UPDATE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY id LIMIT 1;").fetchone()
        if row is None:
            return

        column_data = step[1]

        (column_names, column_values) = get_column_names_values(column_data)
        set_statements = ["{} = ?".format(x) for x in column_names]

        conn.execute("UPDATE item SET {} WHERE id = ?".format(
            ", ".join(set_statements)), tuple([row[0]] + column_values))
        conn.commit()
        return step[2]
    elif op == DELETE:
        row = conn.execute(
            "SELECT id FROM item ORDER BY id LIMIT 1;").fetchone()
        if row is None:
            return

        conn.execute("DELETE FROM item WHERE id = ?", row)
        conn.commit()
        return step[1]


# run up and back down
def sync_all(dbs, since_is_rowid):
    # 0 pulls from everyone
    # then everyone pulls from 0
    # TODO: also test other topologies
    pull_from_dbids = list(range(1, len(dbs)))
    db0 = dbs[0]

    peer_tracker = db0[2]
    conn = db0[1]

    for pull_from in pull_from_dbids:
        since = peer_tracker.get(pull_from, 0)
        new_since = sync_left_to_right(
            dbs[pull_from][1], conn, since, since_is_rowid)
        peer_tracker[pull_from] = new_since

    for push_to in pull_from_dbids:
        push_to_db = dbs[push_to]
        peer_tracker = push_to_db[2]
        push_to_conn = push_to_db[1]
        since = peer_tracker.get(0, 0)

        sync_left_to_right(conn, push_to_conn, since, since_is_rowid)


def sync_from_random_peers(num_peers_to_sync, db, dbs, since_is_rowid):
    peer_tracker = db[2]
    conn = db[1]
    dbid = db[0]

    dbids = list(range(len(dbs)))
    # don't sync with self
    dbids.remove(dbid)

    # pull 1-n other dbids to pull from
    pull_from_dbids = random.choices(
        dbids, k=num_peers_to_sync)

    for pull_from in pull_from_dbids:
        since = peer_tracker.get(pull_from, 0)
        new_since = sync_left_to_right(
            dbs[pull_from][1], conn, since, since_is_rowid)
        peer_tracker[pull_from] = new_since


def sync_left_to_right(l, r, since, since_is_rowid):
    if since_is_rowid:
        changes = l.execute(
            "SELECT *, rowid FROM crsql_changes WHERE rowid > ?", (since,))
    else:
        changes = l.execute(
            "SELECT * FROM crsql_changes WHERE db_version > ?", (since,))

    ret = 0
    for change in changes:
        if since_is_rowid:
            temp = list(change)
            ret = temp.pop()
            change = tuple(temp)
        else:
            ret = change[5]
        r.execute("INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)", change)

    r.commit()
    return ret

# We want to:
#  ('94daba98-68ae-9069-2e79-14ecda1ceeff', None, -248, '', 'F(', 60177) != ('94daba98-68ae-9069-2e79-14ecda1ceeff', None, -248, '', 'F(\x00¤§ÀÝ\U000676dd\U00102cc03', 60177)
#
