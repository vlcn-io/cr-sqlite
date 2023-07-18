ifndef CI_GCC
CC:=gcc
else
CC:=$(CI_GCC)
endif

LOADABLE_CFLAGS=-std=c99 -fPIC -shared -Wall
LIB_CFLAGS=-std=c99 -fPIC -c -Wall

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

ifdef IOS_TARGET
CI_MAYBE_TARGET=$(IOS_TARGET)
rs_build_flags = -Zbuild-std
sysroot_option = -isysroot /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk
endif

prefix=./dist
dbg_prefix=./dbg

TARGET_LOADABLE=$(prefix)/crsqlite.$(LOADABLE_EXTENSION)
TARGET_DBG_LOADABLE=$(dbg_prefix)/crsqlite.$(LOADABLE_EXTENSION)
TARGET_SQLITE3_EXTRA_C=$(prefix)/sqlite3-extra.c
TARGET_SQLITE3=$(prefix)/sqlite3
TARGET_SQLITE3_VANILLA=$(prefix)/vanilla-sqlite3
TARGET_LIB=$(prefix)/crsqlite.a
TARGET_TEST=$(prefix)/test
TARGET_FUZZ=$(prefix)/fuzz
TARGET_TEST_ASAN=$(prefix)/test-asan


# js/browser/wa-sqlite/Makefile, deps/sqlite/GNUMakefile, core/binding.gyp, core/Makefile
ext_files=src/crsqlite.c \
	src/util.c \
	src/tableinfo.c \
	src/changes-vtab.c \
	src/ext-data.c \
	src/get-table.c
ext_headers=src/crsqlite.h \
	src/util.h \
	src/tableinfo.h \
	src/changes-vtab.h \
	src/ext-data.h

$(prefix):
	mkdir -p $(prefix)
$(dbg_prefix):
	mkdir -p $(dbg_prefix)

clean:
	rm -rf $(prefix)
	rm -rf $(dbg_prefix)
	cd rs/bundle && cargo clean


FORMAT_FILES=$(ext_files) $(ext_headers) ./src/core_init.c
format: $(FORMAT_FILES)
	clang-format -i $(FORMAT_FILES)

loadable: $(TARGET_LOADABLE)
loadable_dbg: $(TARGET_DBG_LOADABLE)
sqlite3: $(TARGET_SQLITE3)
vanilla: $(TARGET_SQLITE3_VANILLA)
sqlite3_lib: $(TARGET_LIB)
test: $(TARGET_TEST)
	$(prefix)/test
# ASAN_OPTIONS=detect_leaks=1
asan: CC=clang
asan: $(TARGET_TEST_ASAN)
	$(TARGET_TEST_ASAN)
correctness: $(TARGET_LOADABLE) FORCE
	cd ../py/correctness && pytest
valgrind: $(TARGET_TEST)
	valgrind $(prefix)/test
analyzer:
	scan-build $(MAKE) clean loadable
ubsan: CC=clang
ubsan: LDLIBS += -lubsan
ubsan: clean $(TARGET_TEST)
	$(prefix)/test
fuzz: $(TARGET_FUZZ)
	$(prefix)/fuzz

rs_lib_static = ./rs/bundle/target/release/libcrsql_bundle.a
rs_lib_static_cpy = ./dist/libcrsql_bundle-static.a

rs_lib_dbg_static = ./rs/bundle/target/debug/libcrsql_bundle.a
rs_lib_dbg_static_cpy = ./dbg/libcrsql_bundle-dbg-static.a

rs_lib_loadable = ./rs/bundle/target/release/libcrsql_bundle.a
rs_lib_loadable_cpy = ./dist/libcrsql_bundle-loadable.a

rs_lib_dbg_loadable = ./rs/bundle/target/debug/libcrsql_bundle.a
rs_lib_dbg_loadable_cpy = ./dbg/libcrsql_bundle-dbg-loadable.a

ifdef CI_MAYBE_TARGET
	rs_lib_dbg_static = ./rs/bundle/target/$(CI_MAYBE_TARGET)/debug/libcrsql_bundle.a
	rs_lib_loadable = ./rs/bundle/target/$(CI_MAYBE_TARGET)/release/libcrsql_bundle.a
	rs_lib_dbg_loadable = ./rs/bundle/target/$(CI_MAYBE_TARGET)/debug/libcrsql_bundle.a
	RS_TARGET = --target=$(CI_MAYBE_TARGET)
	ifndef CI_GCC
		C_TARGET = -target $(CI_MAYBE_TARGET)
	endif
endif

$(rs_lib_dbg_static_cpy): FORCE $(dbg_prefix)
	cd ./rs/bundle && cargo build $(RS_TARGET) --features static,omit_load_extension $(rs_build_flags)
	cp $(rs_lib_dbg_static) $(rs_lib_dbg_static_cpy)

$(rs_lib_static_cpy): FORCE $(prefix)
	cd ./rs/bundle && cargo build $(RS_TARGET) --release --features static,omit_load_extension $(rs_build_flags)
	cp $(rs_lib_static) $(rs_lib_static_cpy)

$(rs_lib_loadable_cpy): FORCE $(prefix)
	cd ./rs/bundle && cargo build $(RS_TARGET) --release --features loadable_extension $(rs_build_flags)
	cp $(rs_lib_loadable) $(rs_lib_loadable_cpy)

$(rs_lib_dbg_loadable_cpy): FORCE $(dbg_prefix)
	cd ./rs/bundle && cargo build $(RS_TARGET) --features loadable_extension $(rs_build_flags)
	cp $(rs_lib_dbg_loadable) $(rs_lib_dbg_loadable_cpy)

# Build the loadable extension.
$(TARGET_LOADABLE): $(prefix) $(ext_files) $(rs_lib_loadable_cpy)
	$(CC) -O2 -I./src/ -I./src/sqlite \
	$(LOADABLE_CFLAGS) \
	$(C_TARGET) \
	$(sysroot_option) \
	$(ext_files) $(rs_lib_loadable_cpy) -o $@

$(TARGET_DBG_LOADABLE): $(dbg_prefix) $(ext_files) $(rs_lib_dbg_loadable_cpy)
	$(CC) -g -I./src/ -I./src/sqlite \
	$(LOADABLE_CFLAGS) \
	$(C_TARGET) \
	$(sysroot_option) \
	$(ext_files) $(rs_lib_dbg_loadable_cpy) -o $@

# Build a SQLite CLI that pre-loads cr-sqlite.
# Useful for debugging.
$(TARGET_SQLITE3): $(prefix) $(TARGET_SQLITE3_EXTRA_C) $(rs_lib_dbg_static_cpy) src/sqlite/shell.c $(ext_files)
	$(CC) -g \
	-DSQLITE_THREADSAFE=0 \
	-DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_EXTRA_INIT=core_init \
	-DSQLITE_ENABLE_BYTECODE_VTAB \
	-I./src/ -I./src/sqlite \
	$(TARGET_SQLITE3_EXTRA_C) src/sqlite/shell.c $(ext_files) $(rs_lib_dbg_static_cpy) \
	$(LDLIBS) -o $@

# Build the SQLite library w/ cr-sqlite statically linked in
$(TARGET_LIB): $(prefix) $(TARGET_SQLITE3_EXTRA_C) $(rs_lib_static_cpy) $(ext_files)
	$(CC) -g \
	-DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_EXTRA_INIT=core_init \
	-DHAVE_GETHOSTUUID=0 \
	-I./src/ -I./src/sqlite \
	$(LIB_CFLAGS) \
	$(C_TARGET) \
	$(sysroot_option) \
	$(TARGET_SQLITE3_EXTRA_C) $(ext_files)
	mkdir -p $(prefix)/temp
	rm -f $(prefix)/temp/*
	mv *.o $(prefix)/temp
	cd $(prefix)/temp && ar -x ../libcrsql_bundle-static.a && ar -rc libsqlite3.a *.o && mv libsqlite3.a ../libsqlite3-$(CI_MAYBE_TARGET).a

# Build a normal SQLite CLI that does not include cr-sqlite.
# cr-sqlite can be laoded in via the `.load` pragma.
# Useful for debugging.
$(TARGET_SQLITE3_VANILLA): $(prefix) src/sqlite/shell.c
	$(CC) -g \
	$(DEFINE_SQLITE_PATH) \
	-DSQLITE_THREADSAFE=0 \
	-I./src/ -I./src/sqlite \
	src/sqlite/sqlite3.c src/sqlite/shell.c \
	-o $@

$(TARGET_SQLITE3_EXTRA_C): src/sqlite/sqlite3.c src/core_init.c
	cat src/sqlite/sqlite3.c src/core_init.c > $@

# run tests
$(TARGET_TEST): $(prefix) $(TARGET_SQLITE3_EXTRA_C) src/tests.c src/*.test.c $(ext_files) $(rs_lib_dbg_static_cpy)
	$(CC) -g -Wall \
	-DSQLITE_THREADSAFE=0 \
	-DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_EXTRA_INIT=core_init \
	-DUNIT_TEST=1 \
	-I./src/ -I./src/sqlite \
	$(TARGET_SQLITE3_EXTRA_C) src/tests.c src/*.test.c $(ext_files) $(rs_lib_dbg_static_cpy) \
	$(LDLIBS) -o $@

$(TARGET_TEST_ASAN): $(prefix) $(TARGET_SQLITE3_EXTRA_C) src/tests.c src/*.test.c $(ext_files)
	$(CC) -fsanitize=address -g -fno-omit-frame-pointer -Wall \
	-DSQLITE_THREADSAFE=0 \
	-DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_EXTRA_INIT=core_init \
	-DUNIT_TEST=1 \
	-I./src/ -I./src/sqlite \
	$(TARGET_SQLITE3_EXTRA_C) src/tests.c src/*.test.c $(ext_files) $(rs_lib_dbg_static_cpy) \
	$(LDLIBS) -o $@

$(TARGET_FUZZ): $(prefix) $(TARGET_SQLITE3_EXTRA_C) src/fuzzer.cc $(ext_files)
	clang -fsanitize=fuzzer \
	-DSQLITE_THREADSAFE=0 \
	-DSQLITE_OMIT_LOAD_EXTENSION=1 \
	-DSQLITE_EXTRA_INIT=core_init \
	-I./src/ -I./src/sqlite \
	$(TARGET_SQLITE3_EXTRA_C) src/fuzzer.cc $(ext_files) $(rs_lib_dbg_static_cpy) \
	$(LDLIBS) -o $@

.PHONY: all clean format \
	test \
	loadable \
	loadable_dbg \
	sqlite3 \
	correctness \
	valgrind \
	ubsan analyzer fuzz asan sqlite3_lib

FORCE: ;