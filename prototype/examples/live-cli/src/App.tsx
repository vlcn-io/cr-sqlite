import { DB, Notifier } from "./createDb";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Peer from "peerjs";
import P2P from "./P2P";
import PeerConnections from "./PeerConnections";

const prompt = "sql> ";
const [commands, setCommands] = createSignal<string[]>([]);

const colors = ["green", "magenta", "orange", "purple", "red", "brown", "blue"];
const help = `Trying running .tables to see what tables are available.

  SELECT * FROM table LIMIT 10; to preview a table's contents.

  Prefix queries with \`LIVE\` to run a live query that is updated whenever the queried table's contents change.

  Example:
  LIVE SELECT * FROM track ORDER BY id DESC LIMIT 10;

  Then insert or update a row here (or on a connected peer! Or on a disconnected peer then re-connect them!) and see the live query result change.

select, insert, update, delete, .table & .schema operations are supported in this browser.
\`clear\` clears all results.`;

let numLive = 0;
export default function App({
  db,
  notifier,
  connections,
}: {
  db: DB;
  notifier: Notifier;
  connections: PeerConnections;
}) {
  return (
    <div>
      <P2P connections={connections} />
      <Term db={db} notifier={notifier} />
    </div>
  );
}

function Term({ db, notifier }: { db: DB; notifier: Notifier }) {
  return (
    <div class="term">
      <Output db={db} notifier={notifier} />
      <Input />
    </div>
  );
}

function Output({ db, notifier }: { db: DB; notifier: Notifier }) {
  return (
    <div class="output">
      <For each={commands()}>
        {(cmd, i) => <Cell cmd={cmd} db={db} notifier={notifier} />}
      </For>
      <pre>{help}</pre>
    </div>
  );
}

function Cell({
  cmd,
  db,
  notifier,
}: {
  cmd: string;
  db: DB;
  notifier: Notifier;
}) {
  return (
    <div>
      <div>
        {prompt}
        {cmd}
      </div>
      <div>
        <DBResult cmd={cmd} db={db} notifier={notifier} />
      </div>
    </div>
  );
}

function DBResult({
  cmd,
  db,
  notifier,
}: {
  cmd: string;
  db: DB;
  notifier: Notifier;
}) {
  console.log("execing " + cmd);
  try {
    const [isLive, parsed] = parseCmd(cmd);
    cmd = parsed;
    const [result, setResult] = createSignal(
      db.exec(cmd)[0] || { values: [], columns: [] }
    );

    let myLiveId = 0;
    if (isLive) {
      myLiveId = numLive++;
      const disposable = notifier.on((tables) => {
        // technically we can optimize and not re-run if we don't care about the tables
        console.log("live execing " + cmd);
        const newResult = db.exec(cmd)[0] || { values: [], columns: [] };
        const oldResult = result();
        let hadChange = false;

        // we do this so Solid doesn't re-render identeical rows
        // I wish `for` allowed us to pass a comparator.
        for (let i = 0; i < newResult.values.length; ++i) {
          const oldRow = oldResult.values[i];
          const newRow = newResult.values[i];

          if (arrayEquals(oldRow, newRow)) {
            newResult.values[i] = oldRow;
          } else {
            hadChange = true;
          }
        }

        if (hadChange || newResult.values.length != oldResult.values.length) {
          setResult(newResult);
        }
      });
      onCleanup(disposable);
    }
    // also do our subscribing if the cmd is a select.
    // `result` would need to be a signal updatable by notifier.

    return (
      <Show when={result() != null} fallback={<div></div>}>
        <div
          class={isLive ? "live" : ""}
          style={
            isLive
              ? {
                  "z-index": myLiveId,
                  top:
                    Math.floor((myLiveId * 750) / window.innerWidth) * 250 +
                    "px",
                  left:
                    floorToInterval((myLiveId * 750) % window.innerWidth, 750) +
                    "px",
                  background: colors[myLiveId % colors.length],
                  "border-bottom": `2px solid ${
                    colors[myLiveId % colors.length]
                  }`,
                }
              : {}
          }
        >
          {isLive ? "live: " + cmd : ""}
          <table>
            <thead>
              <tr>
                {result().columns.map((c) => (
                  <th>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <For each={result().values}>
                {(v) => (
                  <tr>
                    {v.map((c) => (
                      <td>{c}</td>
                    ))}
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    );
  } catch (e) {
    return (
      <div>
        <pre>{e.message}</pre>
      </div>
    );
  }
}

let cmdPtr = 0;
function Input() {
  const [cmd, setCmd] = createSignal("");
  function processCommand(e) {
    e.preventDefault();
    const c = cmd();
    if (c.trim().toLowerCase() === "clear") {
      setCommands([]);
    } else {
      setCommands((prev) => [c, ...prev]);
    }

    setCmd("");
    cmdPtr = 0;
    return false;
  }

  return (
    <div class="input">
      <span class="prompt">{prompt}</span>
      <form onSubmit={processCommand}>
        <input
          type="text"
          onChange={(e) => setCmd((e.target as any).value)}
          onKeyDown={(e) =>
            e.key === "ArrowUp"
              ? setCmd(commands()[cmdPtr++ % commands().length] || "")
              : null
          }
          value={cmd()}
          autofocus
        ></input>
      </form>
    </div>
  );
}

// Prevent people from bricking themselves. If they do, whatever. The DB is ephemeral.
function assertAllowed(cmd: string) {
  if (cmd.split(";").filter((s) => s.trim() != "").length > 1) {
    throw new Error("Multiple queries per line are not allowed.");
  }

  cmd = cmd.trim().toLowerCase();
  const allowed =
    cmd.startsWith("insert") ||
    cmd.startsWith("update") ||
    cmd.startsWith("select") ||
    cmd.startsWith("delete") ||
    cmd.startsWith(".") ||
    cmd.startsWith("live");

  if (!allowed) {
    throw new Error(help);
  }
}

function isSelect(cmd: string) {
  return cmd.trim().toLowerCase().startsWith("select");
}

function parseCmd(cmd: string): [boolean, string] {
  const normalized = cmd.trim().toLowerCase();
  if (normalized.startsWith("live")) {
    const baseCmd = cmd.substring("live".length).trim();
    if (!baseCmd.toLowerCase().startsWith("select")) {
      throw new Error("live queries can only be select queries");
    }
    assertAllowed(baseCmd);
    return [true, baseCmd];
  }

  if (cmd.startsWith(".")) {
    const dotCmd = cmd.substring(0, 7);
    cmd = dotCommands[dotCmd](cmd.split(" ")[1]);
    console.log(cmd);
  }

  assertAllowed(cmd);
  return [false, cmd];
}

const dotCommands = {
  ".tables": () => `SELECT 
  name
FROM 
  sqlite_schema
WHERE 
  type ='view' AND 
  name NOT LIKE 'sqlite_%' AND
  name NOT LIKE '%_patch'`,
  ".schema": (t) => `SELECT sql FROM sqlite_schema WHERE name = '${t}'`,
};

function arrayEquals(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index])
  );
}

function floorToInterval(x, i) {
  return x - (x % i);
}
