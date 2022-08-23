CC=gcc
DBG = gdb

SRC = src/crsqlite_extension.c src/vtab.c src/storage.c

crsqlite:
	$(CC) -g -fPIC -shared  $(SRC) -o crsqlite.so

Test:
	$(CC) -g -fPIC unit-tests/main.c crsqlite_extension.c -o crsqlite_test.out
	$(DBG) ./crsqlite_test.out

