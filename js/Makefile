git-deps = deps/wa-sqlite deps/emsdk
node-deps = ./packages/crsqlite-wasm/node_modules
wasm-file = ./packages/crsqlite-wasm/dist/crsqlite.wasm
tsbuildinfo = ./tsbuild-all/tsconfig.tsbuildinfo

.EXPORT_ALL_VARIABLES:
	CRSQLITE_NOPREBUILD = 1

all: $(wasm-file) $(tsbuildinfo)

$(git-deps):
	git submodule update --init --recursive

$(node-deps): $(git-deps)
	pnpm install

$(wasm-file): $(git-deps)
	./build-wasm.sh

$(tsbuildinfo): $(wasm-file) FORCE
	cd tsbuild-all && pnpm run build

test: $(tsbuildinfo) $(wasm-file) FORCE
	./test.sh

clean:
	./deep-clean.sh
	cd deps/wa-sqlite && make clean
	cd ../core/ && make clean

FORCE:

.PHONY: all test clean
