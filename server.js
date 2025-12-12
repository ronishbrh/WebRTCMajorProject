import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

console.log("WebSocket signaling server running on ws://localhost:8080");

let clients = {}; // key = username, value = ws

wss.on("connection", (ws) => {
  let username = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "register") {
      username = data.userName;
      clients[data.userName] = ws;
      console.log(`User registered: ${data.userName}`);
      return;
    }

    //forwarding recipient
    const target = clients[data.to];
    if (!target) {
      console.warn(`Target user ${data.to} not connected`);
      return;
    }

    switch (data.type) {
      case "call-request":
      case "call-accepted":
      case "call-declined":
      case "call-cancelled":
      case "join":
      case "challenge1":
      case "challenge2":
      case "offer":
      case "answer":
      case "ice":
      case "end-call":
        target.send(JSON.stringify(data));
        console.log(`Forwarded ${data.type} from ${data.from} to ${data.to}`);
        break;
      default:
        console.warn(`Unknown message type: ${data.type}`);
    }
  });

  ws.on("close", () => {
    if (username) {
      delete clients[username];
      console.log(`User disconnected: ${username}`);
    }
  });
});