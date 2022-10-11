char *cfsql_deltas() {
  /**
   * Provided clock: {me: 1, peer: 2}
   * 
   * clock:
   * rowid | sid | v
   * ---------------
   *   1     me    1
   *   1    peer   2
   * 
   * select * from clock order by v asc
   * 
   * but group by rowid and aggregate as json?
   * 
   * hmm...
   * 
   * Might not be able to ensure always a monotonic increase per site id in the aggregate?
   * 
   * 1: { m: 1, p: 2}
   * 
   */
}

/*

1 m 1
1 p 1
2 p 2
2 m 0

No total ordering so...

Group into total sets?

Concurrent changes sent in groups?

All concurrent changes applied before advancing clock?

Or keep a clock outside the table that represents "real" advancement? Regardless of what 
is inside the clock table?

A "seen_from" table? Just tracks the versions we have fully processed from peers.

How do we know what we've fully processed from a peer? Can send the rows as we do but only bump version once we hit
a new total order node? A new "least upper bound" node?

Advantage: can chunk concurrente changes
Disadvantage: extra data to manage?
Advantage: easier to get current clock -- do not need to scan all clock tables;

Failure case: can never get through a full concurrent set because it is too big and thus the clock(s) never advance.
Workaround: 

How to determine least upper bounds?

*/