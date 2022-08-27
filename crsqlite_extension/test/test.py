import sqlite3

con = sqlite3.connect(':memory:')
con.enable_load_extension(True)
con.load_extension("./crsqlite")

cur = con.cursor()

cur.execute('''
    CREATE VIRTUAL TABLE contacts USING crsqlite(
	    contact_id INTEGER,
        contact_id2 INTEGER,
	    first_name TEXT NOT NULL,
	    last_name TEXT NOT NULL,
	    email TEXT NOT NULL UNIQUE,
	    phone TEXT NOT NULL UNIQUE,
        PRIMARY KEY(contact_id, contact_id2)
        );'''
    )

cur.execute('''SELECT sql 
FROM sqlite_schema sq
WHERE name = 'crsqlite_contacts';''')
print(cur.fetchall())

cur.execute('''SELECT sql 
FROM sqlite_schema 
WHERE name = 'contacts';''')
print(cur.fetchall())

print("OK")
con.close()