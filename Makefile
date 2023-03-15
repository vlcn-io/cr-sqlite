git-deps = crsqlite-js/deps/wa-sqlite crsqlite-js/deps/emsdk
node-deps = node_modules

all: crsqlite crsqlite-js misc-js model-js

$(git-deps):
	git submodule update --init --recursive

$(node-deps): $(git-deps)
	pnpm install

crsqlite:
	cd cr-sqlite/core; \
	make loadable

crsqlite-js: crsqlite $(node-deps)
	cd crsqlite-js && pnpm run build

misc-js:
	cd misc-js/typescript; \
	pnpm run build

model-js: misc-js
	cd model-js/ts && pnpm run build

.PHONY: crsqlite crsqlite-js misc-js model-js all
