import * as Comlink from "comlink";
import db from "@vlcn.io/crsqlite-wasm/dist/comlinkable";

// augment db to include:
// rx subscriptions
// installation of replicator?

Comlink.expose(db);
