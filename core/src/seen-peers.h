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

#ifndef CRSQLITE_SEEN_PEERS_H
#define CRSQLITE_SEEN_PEERS_H

#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT3

#include <ctype.h>
#include <stdlib.h>

#include "ext-data.h"

#define CRSQL_SEEN_PEERS_INITIAL_SIZE 5

typedef struct crsql_SeenPeer crsql_SeenPeer;
struct crsql_SeenPeer {
  unsigned char *siteId;
  int siteIdLen;
  sqlite3_int64 clock;
};

typedef struct crsql_SeenPeers crsql_SeenPeers;
struct crsql_SeenPeers {
  crsql_SeenPeer *peers;
  size_t len;
  size_t capacity;
};

crsql_SeenPeers *crsql_newSeenPeers();
int crsql_trackSeenPeer(crsql_SeenPeers *a, const unsigned char *siteId,
                        int siteIdLen, sqlite3_int64 clock);
void crsql_resetSeenPeersForTx(crsql_SeenPeers *a);
void crsql_freeSeenPeers(crsql_SeenPeers *a);
int crsql_writeTrackedPeers(crsql_SeenPeers *a, crsql_ExtData *pExtData);

#endif
