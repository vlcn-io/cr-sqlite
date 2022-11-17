#ifndef CRSQLITE_H
#define CRSQLITE_H

/**
 * Extension initialization routine that is run on sqlite startup -- before any connections
 * are established.
 */
int sqlite3_crsqlite_preinit();

/**
 * Extension initialization routine that is run once per connection.
 */
int sqlite3_crsqlite_init(sqlite3 *db, char **pzErrMsg,
                      const sqlite3_api_routines *pApi);

#endif