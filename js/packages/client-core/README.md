# @vlcn.io/client-core

The core components of a `cr-sqlite` client in `client-server` sync setups. `client-websocket` is built on top of this layer to provide sync over a websocket connection.

Example usage:

```
import createReplicator from '@vlcn.io/client-core';

const replicator = await createReplicator(replicatorArgs);
await replicator.start(socket);
```

Also see [client-websocket](../client-websocket/) which uses this package.