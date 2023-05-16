import express from "express";
import ViteExpress from "vite-express";

const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

app.get("/sync/changes", (req, res) => {
  console.log(req.query);
  res.json({ changes: [] });
});

app.post("/sync/changes", (req, res) => {
  console.log(req.body);
  res.json({});
});

app.post("/sync/create-or-migrate", (req, res) => {
  console.log("Create or migrate");
  console.log(req.body);
  res.json({});
});

app.get("/sync/last-seen", (req, res) => {
  console.log(req.query);
  res.json({ lastSeen: 0 });
});

app.post("/sync/start-outbound-stream", (req, res) => {
  console.log(req.body);
  res.json({});
});

ViteExpress.listen(app, PORT, () =>
  console.log(`Listening at http://localhost:${PORT}`)
);
