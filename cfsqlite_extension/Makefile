CC=gcc
DBG = gdb

SRC = src/cfsqlite_extension.c src/vtab.c src/storage.c src/sqlite-createtable-parser/sql3parse_table.c

cfsqlite:
	$(CC) -g -fPIC -shared  $(SRC) -o cfsqlite.so

Test:
	$(CC) -g -fPIC unit-tests/main.c cfsqlite_extension.c -o cfsqlite_test.out
	$(DBG) ./cfsqlite_test.out

