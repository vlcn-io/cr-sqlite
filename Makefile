git-deps = core/rs/sqlite-rs-embedded

.EXPORT_ALL_VARIABLES:
	CRSQLITE_NOPREBUILD = 1

all: crsqlite

$(git-deps):
	git submodule update --init --recursive


crsqlite: $(git-deps)
	cd core; \
	make loadable

clean:
	cd core && make clean

.PHONY: crsqlite all clean
