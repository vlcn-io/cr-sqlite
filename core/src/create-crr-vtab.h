#ifndef CREATE_CRR_VTAB_H
#define CREATE_CRR_VTAB_H

#if !defined(SQLITEINT_H)
#include "sqlite3ext.h"
#endif
SQLITE_EXTENSION_INIT3

extern sqlite3_module crsql_createCrrModule;

#endif
