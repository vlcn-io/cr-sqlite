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

/**
 * Tracks what peers we have seen in a transaction against `crsql_changes`
 *
 * This is so, at the end of the transaction, we can update clock tables
 * for the user making network layers simpler to build.
 */

#include "seen-peers.h"

#include "ext-data.h"
#include "util.h"

// The assumption for using an array over a hash table is that we generally
// don't merge changes from many peers all at the same time.
// TODO: maybe don't even allow this to be growable so we can exit
// when we hit a use case with too many peers? Hard cap to 25?
#define INITIAL_SIZE 5

crsql_SeenPeers *crsql_newSeenPeers() {
  crsql_SeenPeers *ret = sqlite3_malloc(sizeof ret);
  ret->peers = malloc(INITIAL_SIZE * sizeof(crsql_SeenPeer));
  ret->len = 0;
  ret->capacity = INITIAL_SIZE;
}

int crsql_trackSeenPeer(crsql_SeenPeers *a, const unsigned char *siteId,
                        int siteIdLen, sqlite3_int64 clock) {
  // Have we already tacked this peer?
  // If so, take the max of clock values and return.
  for (int i = 0; i < a->len; ++i) {
    if (crsql_siteIdCmp(siteId, siteIdLen, a->peers[i].siteId,
                        a->peers[i].siteIdLen) == 0) {
      if (a->peers[i].clock < clock) {
        a->peers[i].clock = clock;
      }

      return SQLITE_OK;
    }
  }

  // are we at capacity and it is a new peer?
  // increase our size.
  if (a->len == a->capacity) {
    a->capacity *= 2;
    crsql_SeenPeer *temp =
        realloc(a->peers, a->capacity * sizeof(crsql_SeenPeer));
    if (temp == 0) {
      return SQLITE_ERROR;
    }
    a->peers = temp;
  }

  // assign the peer
  // the provided `siteId` param is controlled by `sqlite` as an argument to the
  // insert statement and may not exist on transaction commit if many insert
  // calls are made against the vtab
  a->peers[a->len].siteId = sqlite3_malloc(siteIdLen * sizeof(char));
  memcpy(a->peers[a->len].siteId, siteId, siteIdLen);

  a->len += 1;
  return SQLITE_OK;
}

void crsql_resetSeenPeersForTx(crsql_SeenPeers *a) {
  // free the inner allocations since we'll overwrite those
  for (int i = 0; i < a->len; ++i) {
    sqlite3_free(a->peers[i].siteId);
  }

  // re-wind our length back to 0 for the next transaction
  // this structure is allocated once per connection and each connection must
  // only be used from one thread.
  a->len = 0;
}

void crsql_freeSeenPeers(crsql_SeenPeers *a) {
  for (int i = 0; i < a->len; ++i) {
    sqlite3_free(a->peers[i].siteId);
  }
  sqlite3_free(a->peers);
  sqlite3_free(a);
}

int crsql_writeTrackedPeers(crsql_SeenPeers *a, crsql_ExtData *pExtData) {
  int rc = SQLITE_OK;
  if (a->len == 0) {
    return rc;
  }

  for (int i = 0; i < a->len; ++i) {
    rc = sqlite3_bind_blob(pExtData->pTrackPeersStmt, 1, a->peers[i].siteId,
                           a->peers[i].siteIdLen, SQLITE_STATIC);
    rc += sqlite3_bind_int64(pExtData->pTrackPeersStmt, 2, a->peers[i].clock);
    // TODO: allow tagging of peer tracking for partial db replication
    rc += sqlite3_bind_null(pExtData->pTrackPeersStmt, 3);
    if (rc != SQLITE_OK) {
      sqlite3_clear_bindings(pExtData->pTrackPeersStmt);
      return rc;
    }

    rc = sqlite3_step(pExtData->pTrackPeersStmt);
    if (rc != SQLITE_DONE) {
      sqlite3_reset(pExtData->pTrackPeersStmt);
      sqlite3_clear_bindings(pExtData->pTrackPeersStmt);
      return rc;
    }

    rc = sqlite3_reset(pExtData->pTrackPeersStmt);
    rc += sqlite3_clear_bindings(pExtData->pTrackPeersStmt);
    if (rc != SQLITE_OK) {
      return rc;
    }
  }

  return rc;
}