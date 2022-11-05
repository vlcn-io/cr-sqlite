COMMIT=$(shell git rev-parse HEAD)
VERSION=$(shell cat VERSION)
DATE=$(shell date +'%FT%TZ%z')

LOADABLE_CFLAGS=-fPIC -shared

ifeq ($(shell uname -s),Darwin)
CONFIG_DARWIN=y
else ifeq ($(OS),Windows_NT)
CONFIG_WINDOWS=y
else
CONFIG_LINUX=y
endif

ifdef CONFIG_DARWIN
LOADABLE_EXTENSION=dylib
endif

ifdef CONFIG_LINUX
LOADABLE_EXTENSION=so
endif

ifdef CONFIG_WINDOWS
LOADABLE_EXTENSION=dll
endif

DEFINE_SQLITE_PATH_DATE=-DSQLITE_PATH_DATE="\"$(DATE)\""
DEFINE_SQLITE_PATH_VERSION=-DSQLITE_PATH_VERSION="\"$(VERSION)\""
DEFINE_SQLITE_PATH_SOURCE=-DSQLITE_PATH_SOURCE="\"$(COMMIT)\""
DEFINE_SQLITE_PATH=$(DEFINE_SQLITE_PATH_DATE) $(DEFINE_SQLITE_PATH_VERSION) $(DEFINE_SQLITE_PATH_SOURCE)

prefix=../dist

TARGET_LOADABLE=$(prefix)/crsqlite.$(LOADABLE_EXTENSION)
TARGET_SQLITE3_EXTRA_C=$(prefix)/sqlite3-extra.c
TARGET_SQLITE3=$(prefix)/sqlite3
TARGET_SQLITE3_VANILLA=$(prefix)/vanilla-sqlite3
TARGET_SQLJS_JS=$(prefix)/sqljs.js
TARGET_SQLJS_WASM=$(prefix)/sqljs.wasm
TARGET_SQLJS=$(TARGET_SQLJS_JS) $(TARGET_SQLJS_WASM)
TARGET_TEST=$(prefix)/test

ext_files=crsqlite.c util.c tableinfo.c triggers.c normalize.c changes-vtab.c changes-vtab-read.c changes-vtab-common.c changes-vtab-write.c ext-data.c
ext_headers=crsqlite.h csflite-utils.h tablinfo.h triggers.h changes-vtab.h changes-vtab-read.h changes-vtab-common.h changes-vtab-write.h ext-data.h

$(prefix):
	mkdir -p $(prefix)

clean:
	rm -rf dist/*

FORCE: ;

FORMAT_FILES=$(ext_files) $(ext_headers) core_init.c
format: $(FORMAT_FILES)
	clang-format -i $(FORMAT_FILES)

loadable: $(TARGET_LOADABLE)
sqlite3: $(TARGET_SQLITE3)
vanilla: $(TARGET_SQLITE3_VANILLA)
sqljs: $(TARGET_SQLJS)
test: $(TARGET_TEST)
	../dist/test
correctness: $(TARGET_LOADABLE) FORCE
	cd ./correctness && pytest

$(TARGET_LOADABLE): $(ext_files)
	gcc -I./ -I./sqlite \
	$(LOADABLE_CFLAGS) \
	$(DEFINE_SQLITE_PATH) \
	-DSQLITE_ENABLE_NORMALIZE \
	$(ext_files) -o $@

$(TARGET_SQLITE3): $(prefix) $(TARGET_SQLITE3_EXTRA_C) sqlite/shell.c $(ext_files)
	gcc -g \
	$(DEFINE_SQLITE_PATH) \
	-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_ENABLE_NORMALIZE \
	-DSQLITE_EXTRA_INIT=core_init \
	-I./ -I./sqlite \
	$(TARGET_SQLITE3_EXTRA_C) sqlite/shell.c $(ext_files) \
	-o $@

$(TARGET_SQLITE3_VANILLA): $(prefix) sqlite/shell.c
	gcc -g \
	$(DEFINE_SQLITE_PATH) \
	-DSQLITE_THREADSAFE=0 \
	-DSQLITE_ENABLE_NORMALIZE \
	-I./ -I./sqlite \
	sqlite/sqlite3.c sqlite/shell.c \
	-o $@

$(TARGET_SQLITE3_EXTRA_C): sqlite/sqlite3.c core_init.c
	cat sqlite/sqlite3.c core_init.c > $@

$(TARGET_TEST): $(prefix) $(TARGET_SQLITE3_EXTRA_C) tests.c *.test.c $(ext_files)
	gcc -g \
	$(DEFINE_SQLITE_PATH) \
	-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_ENABLE_NORMALIZE \
	-DSQLITE_EXTRA_INIT=core_init \
	-DUNIT_TEST=1 \
	-I./ -I./sqlite \
	$(TARGET_SQLITE3_EXTRA_C) tests.c *.test.c $(ext_files) \
	-o $@

.PHONY: all clean format \
	test test-watch test-format \
	loadable test-loadable test-loadable-watch
