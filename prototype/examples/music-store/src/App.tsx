import { DB, Notifier } from "./createDb";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

const prompt = "sql> ";
const [commands, setCommands] = createSignal<string[]>([]);

export default function App({ db, notifier }: { db: DB; notifier: Notifier }) {
  return <Term db={db} notifier={notifier} />;
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
    const [result, setResult] = createSignal(db.exec(cmd));

    if (isLive) {
      const disposable = notifier.on((tables) => {
        // technically we can optimize and not re-run if we don't care about the tables
        setResult(db.exec(cmd));
      });
      onCleanup(disposable);
    }
    // also do our subscribing if the cmd is a select.
    // `result` would need to be a signal updatable by notifier.

    // is a for component usable for nested arrays?
    return (
      <Show when={result()[0] != null} fallback={<div></div>}>
        <table>
          <thead>
            <tr>
              {result()[0].columns.map((c) => (
                <th>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result()[0].values.map((v) => (
              <tr>
                {v.map((c) => (
                  <td>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Show>
    );
  } catch (e) {
    return <div>{e.message}</div>;
  }
}

let cmdPtr = 0;
function Input() {
  const [cmd, setCmd] = createSignal("");
  function processCommand(e) {
    e.preventDefault();
    setCommands((prev) => [cmd(), ...prev]);
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
    throw new Error(
      "Only select / insert / update / delete queries may be run."
    );
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
