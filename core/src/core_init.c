/**
 * Copyright 2022 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
  This file is appended to the end of a sqlite3.c amalgammation
  file to include crsqlite functions statically in
  a build. This is used for the demo CLI and WASM implementations.
*/
#include "ext.h"

int sqlite3_crsqlrustbundle_init(sqlite3 *db, char **pzErrMsg,
                                 const sqlite3_api_routines *pApi);

static int bundle_init(sqlite3 *db, char **pzErrMsg,
                       const sqlite3_api_routines *pApi) {
  int rc = sqlite3_crsqlite_init(db, pzErrMsg, pApi);
  if (rc != SQLITE_OK) {
    return rc;
  }

  return sqlite3_crsqlrustbundle_init(db, pzErrMsg, pApi);
}

int core_init(const char *dummy) {
  return sqlite3_auto_extension((void *)bundle_init);
}
