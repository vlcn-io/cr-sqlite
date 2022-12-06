/**
 * Keeps track of all fully established connections.
 *
 * This is used such that each connection can notify all others once it has applied
 * new changes to the DB.
 *
 * This will cause all other connections to wake up and push the new
 * set of changes over the wire.
 *
 * Possibile optimization: Could we do this as `0 read`? I.e., only fan out changes rather than
 * read from the db?
 *
 * TODO: we need to gate this in some sort of realm.
 * E.g., the site id of the db on the server.
 *
 * We also need a simple way to create new dbs with a provided schema.
 */

import { EstablishedConnection } from "./connection.js";
import { SiteIdWire } from "./protocol.js";

const connections = new Map<SiteIdWire, EstablishedConnection>();
const establishedConnections = {
  add(c: EstablishedConnection) {
    const existing = connections.get(c.site);
    if (existing) {
      existing.close("DUPLICATE_SITE");
    }

    connections.set(c.site, c);
    c.onClosed = () => {
      connections.delete(c.site);
    };
  },
};

class EstablishedConnections {}

export default function establishedConnectionsFactory(desiredDb: SiteIdWire) {}
