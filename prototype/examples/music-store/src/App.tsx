import { DB, Notifier } from "./createDb";
import { createSignal, For } from "solid-js";

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
    <For each={commands()}>
      {(cmd, i) => <Cell cmd={cmd} db={db} notifier={notifier} />}
    </For>
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
  console.log("execing " + cmd);

  // also do our subscribing......
  // I guess `result` would need to be a signal updatable by notifier.
  try {
    assertAllowed(cmd);
    const result = db.exec(cmd);
    return (
      <div>
        <div>
          {prompt}
          {cmd}
        </div>
        <div>future result...</div>
      </div>
    );
  } catch (e) {
    return (
      <div>
        <div>
          {prompt}
          {cmd}
        </div>
        <div>{e.message}</div>
      </div>
    );
  }
}

function Input() {
  const [cmd, setCmd] = createSignal("");
  function processCommand(e) {
    e.preventDefault();
    setCommands((prev) => [...prev, cmd()]);
    setCmd("");
    return false;
  }

  return (
    <div class="input">
      <span class="prompt">{prompt}</span>
      <form onSubmit={processCommand}>
        <input
          type="text"
          onChange={(e) => setCmd((e.target as any).value)}
          value={cmd()}
          autofocus
        ></input>
      </form>
    </div>
  );
}

function assertAllowed(cmd: string) {
  cmd = cmd.trim().toLowerCase();
  const allowed =
    cmd.startsWith("insert") ||
    cmd.startsWith("update") ||
    cmd.startsWith("select") ||
    cmd.startsWith("delete");

  if (!allowed) {
    throw new Error(
      "Only select / insert / update / delete queries may be run."
    );
  }
}
