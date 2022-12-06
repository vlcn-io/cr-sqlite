const ws = new WebSocket("ws://localhost:8080/sync");

ws.onopen = (e) => {
  console.log("opened", e);
  ws.send(
    JSON.stringify({
      _tag: "e",
      from: "1",
      to: "2",
    })
  );
};

ws.onmessage = (e) => {
  console.log("got msg", e);
};
