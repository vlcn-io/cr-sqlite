import sqlite3
import time

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

t1 = time.time()
for i in range(0, 100000):
    cur.execute(
        f"INSERT INTO test VALUES({i}, 'b', 'c');"
        )    

t2 = time.time()
print(t2-t1)

cur.execute('''
    CREATE TABLE test2(
	    a INTEGER PRIMARY KEY,
	    b TEXT,
	    c TEXT
        );'''
    )

t1 = time.time()
for i in range(0, 100000):
    cur.execute(
        f" INSERT INTO test2 VALUES({i}, 'b', 'c'); "
        )    

t2 = time.time()
print(t2-t1)


#print(cur.fetchall())


# cur.execute('''SELECT sql 
# FROM sqlite_schema sq
# WHERE name = 'cfsqlite_contacts';''')
# print(cur.fetchall())

# cur.execute('''SELECT sql 
# FROM sqlite_schema 
# WHERE name = 'contacts';''')
# print(cur.fetchall())

con.close()