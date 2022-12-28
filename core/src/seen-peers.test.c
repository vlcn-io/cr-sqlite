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

#include "seen-peers.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static void testAllocation() {
  printf("Allocation\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();
  assert(seen->len == 0);
  assert(seen->capacity == CRSQL_SEEN_PEERS_INITIAL_SIZE);
  assert(seen->peers != 0);

  for (int i = 0; i < CRSQL_SEEN_PEERS_INITIAL_SIZE; ++i) {
    assert(seen->peers[i].clock == 0);
    assert(seen->peers[i].siteId == 0);
    assert(seen->peers[i].siteIdLen == 0);
  }

  printf("\t\e[0;32mSuccess\e[0m\n");

  crsql_freeSeenPeers(seen);
}

static void testTrackNewPeer() {
  printf("TrackNewPeer\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();

  crsql_trackSeenPeer(seen, (const unsigned char *)"blob", 5, 100);
  assert(seen->len == 1);
  assert(seen->peers[0].clock == 100);
  assert(seen->peers[0].siteIdLen == 5);
  assert(strcmp((const char *)seen->peers[0].siteId, "blob") == 0);
  assert(seen->capacity == CRSQL_SEEN_PEERS_INITIAL_SIZE);

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_freeSeenPeers(seen);
}

static void testTrackExistingPeer() {
  printf("TrackExistingPeer\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();

  crsql_trackSeenPeer(seen, (const unsigned char *)"blob", 5, 100);
  crsql_trackSeenPeer(seen, (const unsigned char *)"blob", 5, 200);

  assert(seen->len == 1);
  assert(seen->peers[0].clock == 200);
  assert(seen->peers[0].siteIdLen == 5);
  assert(strcmp((const char *)seen->peers[0].siteId, "blob") == 0);
  assert(seen->capacity == CRSQL_SEEN_PEERS_INITIAL_SIZE);

  crsql_trackSeenPeer(seen, (const unsigned char *)"blob", 5, 2);

  assert(seen->len == 1);
  assert(seen->peers[0].clock == 200);
  assert(seen->peers[0].siteIdLen == 5);
  assert(strcmp((const char *)seen->peers[0].siteId, "blob") == 0);
  assert(seen->capacity == CRSQL_SEEN_PEERS_INITIAL_SIZE);

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_freeSeenPeers(seen);
}

static void testArrayGrowth() {
  printf("ArrayGrowth\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();

  for (int i = 0; i < 11; ++i) {
    char *blob = sqlite3_mprintf("b%d", i);
    int blobLen = strlen(blob) + 1;
    crsql_trackSeenPeer(seen, (unsigned char *)blob, blobLen, i);
    sqlite3_free(blob);
  }

  assert(seen->capacity == 20);
  assert(seen->len == 11);

  for (int i = 0; i < 11; ++i) {
    char *blob = sqlite3_mprintf("b%d", i);
    int blobLen = strlen(blob) + 1;
    assert(seen->peers[i].clock == i);
    assert(seen->peers[i].siteIdLen == blobLen);
    assert(strcmp((char *)seen->peers[i].siteId, blob) == 0);
    sqlite3_free(blob);
  }

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_freeSeenPeers(seen);
}

static void testReset() {
  printf("Reset\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();
  crsql_trackSeenPeer(seen, (const unsigned char *)"blob1", 6, 100);
  crsql_trackSeenPeer(seen, (const unsigned char *)"blob2", 6, 200);

  crsql_resetSeenPeersForTx(seen);
  assert(seen->len == 0);

  crsql_trackSeenPeer(seen, (const unsigned char *)"blob1", 6, 1);
  crsql_trackSeenPeer(seen, (const unsigned char *)"blob2", 6, 2);

  assert(seen->len == 2);
  assert(seen->peers[0].clock == 1);
  assert(seen->peers[1].clock == 2);

  crsql_trackSeenPeer(seen, (const unsigned char *)"blob1", 6, 11);
  crsql_trackSeenPeer(seen, (const unsigned char *)"blob2", 6, 22);

  assert(seen->len == 2);
  assert(seen->peers[0].clock == 11);
  assert(seen->peers[1].clock == 22);

  printf("\t\e[0;32mSuccess\e[0m\n");
  crsql_freeSeenPeers(seen);
}

// Really only exists for simple valgrind/asan leak tracking
static void testFree() {
  printf("Free\n");
  crsql_SeenPeers *seen = crsql_newSeenPeers();
  crsql_freeSeenPeers(seen);
  printf("\t\e[0;32mSuccess\e[0m\n");
}

static void testWriteTrackedPeersToDb() {}

void crsqlSeenPeersTestSuite() {
  printf("\e[47m\e[1;30mSuite: seenpeers\e[0m\n");

  testAllocation();
  testTrackNewPeer();
  testTrackExistingPeer();
  testArrayGrowth();
  testReset();
  testFree();
  testWriteTrackedPeersToDb();
}