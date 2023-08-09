import { Config, defaultConfig } from "@vlcn.io/ws-client";
import { createDbProvider } from "@vlcn.io/ws-browserdb";
import schema from "./schemas/main.sql?raw";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

export const config: Config = {
  dbProvider: createDbProvider(wasmUrl, {
    schemaName: "main.sql",
    schemaContent: schema,
  }),
  transportProvider: defaultConfig.transportProvider,
};
