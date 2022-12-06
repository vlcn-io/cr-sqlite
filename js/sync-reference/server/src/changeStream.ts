// After an `establishedConnection` has received a `requestChanges` event
// we start a change stream for that client.

// change stream:
// 1. sends the requested changes up till now
// 2. records `endSeq`
// 3. sends from `endSeq` till now on db change events not caused by the client
// pulling changesets filters against the client's id
