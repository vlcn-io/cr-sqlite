import { DB } from "@vlcn.io/xplat-api";

/**
 * Write the test code once, run it on all platforms that support crsqlite.
 *
 * Browser tests use a WASM build.
 * Node/Deno tests use a nativ build.
 *
 * Hence dbProvider to provide the db in the current environment.
 *
 * Browser tests use cypress which uses Chai assertions.
 * Node/Deno use Jest assetions.
 *
 * Hence the assertion provider.
 *
 */
export const tests = {
  "triggers installed": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "peer tracking tabe": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "changes causes trigger causes poke": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "re-install trigger on schema change": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "receiving poke results in request changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "tread down removes triggers": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "receiving changes applies changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "pushes changes when changes requested": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
};
