import initSqlJs from "sql.js";
export type Notifier = typeof notifier;
export type DB = {
  exec(q: string): [{ columns: string[]; values: any[][] }];
  run(q: string): void;
  prepare(q: string): any;
};

export default async function initDb(
  siteId: string
): Promise<[any, typeof notifier]> {
  const sqlPromise = initSqlJs({
    locateFile: (file) => `/${file}`,
  });
  const dataPromise = fetch("/chinook-crr.db").then((res) => res.arrayBuffer());
  const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
  const db = new SQL.Database(new Uint8Array(buf));

  db.run(`UPDATE "crr_site_id" SET id = '${siteId}' WHERE "invariant" = 0`);

  enableReactivity(db);

  return [db, notifier];
}

const callbacks: Set<(ts: Set<string>) => void> = new Set();
const notifier = {
  on(c: (ts: Set<string>) => void) {
    callbacks.add(c);
    return () => callbacks.delete(c);
  },
};

function notify(tables: Set<string>) {
  for (const c of callbacks) {
    c(tables);
  }
}

function enableReactivity(db) {
  let timeoutHandle: number | null = null;
  let collectedTables: Set<string> = new Set();

  db.create_function("Notify", (data) => {
    // Batch and de-duplicate all notification data.
    // Process it on the next tick of the event loop
    collectedTables.add(data);

    if (timeoutHandle == null) {
      timeoutHandle = setTimeout(() => {
        notify(collectedTables);
        collectedTables = new Set();
        timeoutHandle = null;
      }, 0);
    }
  });

  const crrTables = db.exec(
    `SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE '%_crr'`
  );

  for (const tableName of crrTables[0].values) {
    createTriggers(db, tableName);
  }
}

function createTriggers(db, table: string) {
  // we could be smarter on the notify of course -- and notify with the ids that are changed.
  db.run(`CREATE TRIGGER "${table}_insert_Notify" AFTER INSERT ON ${table}
  BEGIN
    select Notify('${table}') as '';
  END;`);
  db.run(`CREATE TRIGGER "${table}_update_Notify" AFTER UPDATE ON ${table}
  BEGIN
    select Notify('${table}') as '';
  END;`);
}
