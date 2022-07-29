import { DB, Notifier } from "./createDb";
import { createSignal, For } from "solid-js";

const prompt = "sql> ";
const [commands, setCommands] = createSignal<string[]>([]);

export default function App({ db, notifier }: { db: DB; notifier: Notifier }) {
  return <Term />;
}

function Term() {
  return (
    <div class="term">
      <Output />
      <Input />
    </div>
  );
}

function Output() {
  return (
    <For each={commands()}>
      {(cmd, i) => (
        <div>
          {prompt}
          {cmd}
        </div>
      )}
    </For>
  );
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
    <div>
      {prompt}
      <form onSubmit={processCommand}>
        <input
          type="text"
          onChange={(e) => setCmd((e.target as any).value)}
          value={cmd()}
        ></input>
      </form>
    </div>
  );
}
