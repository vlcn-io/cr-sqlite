import { FormatConfig, SQLQuery } from '@databases/sql';
import connect, { DatabaseConnection, sql } from '@databases/sqlite';
import { escapeSQLiteIdentifier } from '@databases/escape-identifier';

export const sqliteFormat: FormatConfig = {
  escapeIdentifier: str => escapeSQLiteIdentifier(str),
  formatValue: value => ({ placeholder: '?', value }),
};

export default async function setupDb(file?: string): Promise<DatabaseConnection> {
  const db = connect(file);

  // Process schemas serially. Some depend on one another
  // and not a big enough deal to parallelize those that do not.
  await runfile(db, 'crr_db_version.sqlite.sql');
  await runfile(db, 'crr_peer_id.sqlite.sql');
  await runfile(db, 'prime_version.sqlite.sql');
  await runfile(db, 'prime_peer_id.sqlite.sql');
  await runfile(db, 'todo_crr.sqlite.sql');
  await runfile(db, 'todo_view.sqlite.sql');
  await runfile(db, 'insert_todo_trig.sqlite.sql');
  await runfile(db, 'update_todo_trig.sqlite.sql');
  await runfile(db, 'delete_todo_trig.sqlite.sql');
  await runfile(db, 'todo_patch.sqlite.sql');
  await runfile(db, 'insert_todo_patch.sqlite.sql');
  await runfile(db, 'todo_vector_clocks.sqlite.sql');

  return db;
}

async function runfile(db: DatabaseConnection, file: string) {
  // console.log('Running: ' + file);
  await db.query(sql.file('../schemas/' + file));
}
