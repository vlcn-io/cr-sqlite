import sqlite3

con = sqlite3.connect(':memory:')
con.enable_load_extension(True)
con.load_extension("./cfsqlite")

cur = con.cursor()

# cur.execute('''
#     CREATE VIRTUAL TABLE contacts USING cfsqlite(
# 	    contact_id INTEGER PRIMARY KEY,
# 	    first_name TEXT NOT NULL,
# 	    last_name TEXT NOT NULL,
# 	    email TEXT NOT NULL UNIQUE,
# 	    phone TEXT NOT NULL UNIQUE,
#         );'''
#     )

cur.execute('''
    CREATE VIRTUAL TABLE test USING cfsqlite(
	    a INTEGER PRIMARY KEY,
	    b TEXT,
	    c TEXT
        );'''
    )

cur.execute('''
    INSERT INTO test VALUES(100, "b", "c");'''
    )

cur.execute('''
    INSERT INTO test VALUES(101, "b", "c");'''
    )

cur.execute('''
    SELECT * FROM cfsqlite_test;
    '''
)
print(cur.fetchall())


# cur.execute('''SELECT sql 
# FROM sqlite_schema sq
# WHERE name = 'cfsqlite_contacts';''')
# print(cur.fetchall())

# cur.execute('''SELECT sql 
# FROM sqlite_schema 
# WHERE name = 'contacts';''')
# print(cur.fetchall())

con.close()