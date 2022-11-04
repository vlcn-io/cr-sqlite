/**
 * 
 * Connect and stream?
 * Or poke and pull?
 * 
 * Need an rx hoook...
 * need to update it on schema change...
 * 
 * 
 * hooks on clock tables
 * https://github.com/sql-js/sql.js/issues/234
 * 
 * which can return to us changed cols.
 * 
 * can we get full on changed row data?
 * 
 * should prob `after update` on base tables (less events)
 * then, after all events are gotten, select for clock data.
 * 
 * we could use our extension for selecting changes or get them ourself.
 * 
 * -> keep our v
 * -> select * from changes where v > last_v
 *   post update(s)
 * 
 * Ensure replicator removes trigger on shutdown.
 * 
 * In summary:
 * 
 * replicator.start(db);
 * 
 * - replicator installs its fn extension
 * - replicator its triggers
 * - replicator collects updates per tick
 * - repliactor asks for changes since last it asked
 * - replicator forwards across wire to connected peers
 *  - we need to track and handle re-sends...
 * 
 * easier algo for handling re-sends:
 * - replicator installs its fn extension
 * - triggers
 * - gets updated
 * - pokes connected peers with (min_v, max_v) of cs
 * 
 * poked peers:
 * - checks poke
 * - if poke max_v < changes held from that peer, do nothing
 * - else, ask for changes since last asked
 */