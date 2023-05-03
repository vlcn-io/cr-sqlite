# @vlcn.io/direct-connect-nodejs

Libraries for facilitating direct connect sync from nodejs.

You can use these to easily create a REST server, WebSocket server, GRPC or anything else.

## Rest Example

```js
import {
  DefaultConfig,
  ServiceDB,
  DBCache,
  SyncService,
  jsonDecode,
  jsonEncode,
} from "@vlcn.io/direct-connect-nodejs";
const svcDb = new ServiceDB(DefaultConfig, true);
const cache = new DBCache(DefaultConfig, svcDb.defaultSchemaProvider);
let svc = new SyncService(DefaultConfig, cache, svcDb);

app.get("/changes", (req, res) => {
  const query = url.parse(req.url).query;
  const msg = jsonDecode(JSON.parse(decodeURIComponent(query)));
  res.json(svc.getChanges(msg));
});
app.post("/changes", (req, res) => {
  const msg = jsonDecode(req.body);
  res.json(svc.applyChanges(msg));
});
app.post("/last-seen", (req, res) => {
  const msg = jsonDecode(req.body);
  res.json(svc.getLastSeen(msg));
});
app.post("/change-stream", (req, res) => {
  const msg = jsonDecode(req.body);
  const stream = svc.startOutboundStream(msg);
  // set up server sent event stream
});
```
