const ws = new WebSocket("ws://localhost:8080/sync");

ws.onopen = (e) => {
  console.log("opened", e);
};

ws.onmessage = (e) => {
  console.log("got msg", e);
};
