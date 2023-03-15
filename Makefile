git-deps = core/rs/sqlite-rs-embedded
node-deps = node_modules

.EXPORT_ALL_VARIABLES:
	CRSQLITE_NOPREBUILD = 1

all: crsqlite js

$(git-deps):
	git submodule update --init --recursive

$(node-deps): $(git-deps)
	pnpm install

crsqlite: $(git-deps)
	cd core; \
	make loadable

js: crsqlite $(node-deps)
	cd js && make all

.PHONY: crsqlite js all
