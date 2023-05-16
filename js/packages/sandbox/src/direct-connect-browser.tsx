import React from "react";
import { createRoot } from "react-dom/client";

import { CtxAsync, useQuery } from "@vlcn.io/react";
import { WorkerInterface, newDbid } from "@vlcn.io/direct-connect-browser";
import workerUrl from "@vlcn.io/direct-connect-browser/shared.worker.js?url";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import initWasm from "@vlcn.io/crsqlite-wasm";
import tblrx from "@vlcn.io/rx-tbl";
import testSchema from "./schemas/testSchema.mjs";
import randomWords from "./support/randomWords.js";
type TestRecord = { id: string; name: string };

const sqlite = await initWasm(() => wasmUrl);

// Document how to get a dbid.
// Either:
// 1. From a URL
// 2. Generate a new one
// 3. From a login service
// 4. From a document share
// 5. From a QR code
// 6. From some other source
// const dbid = newDbid();
const dbid = "5421f3dc8eb548c1b07cf92bec2c459e" as any;
const db = await sqlite.open(dbid);

const syncWorker = new WorkerInterface(workerUrl, wasmUrl);
await db.automigrateTo(testSchema.name, testSchema.content);

const rx = tblrx(db);
syncWorker.startSync(
  dbid,
  {
    createOrMigrate: new URL("/sync/create-or-migrate", window.location.origin),
    applyChanges: new URL("/sync/changes", window.location.origin),
    startOutboundStream: new URL(
      "/sync/start-outbound-stream",
      window.location.origin
    ),
  },
  rx
);

const root = createRoot(document.getElementById("container")!);
root.render(
  <App
    ctx={{
      db,
      rx,
    }}
  />
);

const wordOptions = { exactly: 3, join: " " };
function App({ ctx }: { ctx: CtxAsync }) {
  const data = useQuery<TestRecord>(
    ctx,
    "SELECT * FROM test ORDER BY rowid DESC"
  ).data;

  const addData = () => {
    ctx.db.exec("INSERT INTO test (id, name) VALUES (?, ?);", [
      nanoid(10),
      randomWords(wordOptions) as string,
    ]);
  };

  return (
    <div style={{ minWidth: 350 }}>
      <button
        onClick={addData}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Add Data
      </button>
      <table className="table-auto">
        <thead>
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Name</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td className="border px-4 py-2">{row.id}</td>
              <td className="border px-4 py-2">{row.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const nanoid = (t = 21) =>
  crypto
    .getRandomValues(new Uint8Array(t))
    .reduce(
      (t, e) =>
        (t +=
          (e &= 63) < 36
            ? e.toString(36)
            : e < 62
            ? (e - 26).toString(36).toUpperCase()
            : e > 62
            ? "-"
            : "_"),
      ""
    );
