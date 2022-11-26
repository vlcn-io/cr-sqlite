import cluster from "cluster";
import * as express from "express";
import * as os from "os";

const port = 3000;
const cCPUs = os.cpus().length;
// TODO: We should manually route to the correct worker based on dbid to
// prevent concurrent connections to the same db.
// dbid % num_workers -> worker to use
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/conn", (req, res) => {
  // respond with conn to relevant WS server
  res.send({});
});

app.listen(port);
