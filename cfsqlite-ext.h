#ifndef CFSQLITE_H
#define CFSQLITE_H

int sqlite3_cfsqlite_init(sqlite3 *db, char **pzErrMsg,
                      const sqlite3_api_routines *pApi);

#endif