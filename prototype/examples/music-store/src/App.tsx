import { DB, Notifier } from "./createDb";

export default function App({ db, notifier }: { db: DB; notifier: Notifier }) {
  return <div>Hello</div>;
}

function Term() {
  return <div></div>;
}
