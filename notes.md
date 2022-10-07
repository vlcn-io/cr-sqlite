- support for:
  - centralized sync
    vs
  - p2p sync

Centralized sync can bound vector clock growth. Clients need to record the max value they have
from a given server / big peer.

Clients sending changes to server... They send all rows they've created or modified locally.

So.. storage can be the same as vector clock scheme (we have clocks, we have update src)
but syncing is different.

Sync strategy for big peer:

- Connect to big peer
- send them all rows you've written since you last saw them
  - how to determine this though? you can record your db version from your last sync.
    and grab anything with a vclock entry for your site that is > that db version.
- ask them for all rows since your greatest timestamp for them

TODO:

- we don't have a plan for rows with large columns. We also currently send full rows rather than partial rows on update(s).
  To do partial rows would require clocks on the columns? or... you can cache version numbers for rows you've sent
  and use that to filter future updates.

  Or you can keep the full causal graph and just replay the causal graph to sync.
  Causal graph is an event log, timestamped by tx, that records (row, cols) that changed.
  In big-peer model we can drop this log after every complete sync.
