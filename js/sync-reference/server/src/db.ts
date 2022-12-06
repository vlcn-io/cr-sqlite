import { Changeset, SiteIdWire } from "./protocol.js";

// Map of weak refs to DB instances

export class DB {
  constructor(siteId: SiteIdWire) {
    // validate that siteId is an actual uuidv4
    // throw if not
    // check if file exists
  }

  applyChangeset(changes: Changeset[]) {}

  onChanged(cb: () => void) {}
}

// If the DB doesn't exist, we could create it.
// Note: how does this work in a distributed setting via litefs? Any concurrency issues of
// two nodes creating the same db at the same time?
//
// Note: creating the DB should be an _explicit_ operation
// requested by the end user and requires a schema for the db to use.
export default function dbFactory(desiredDb: SiteIdWire): DB {
  return new DB(desiredDb);
}
