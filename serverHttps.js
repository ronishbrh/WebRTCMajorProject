import fs from "fs";
import https from "https";
import { WebSocketServer } from "ws";

const server = https.createServer({
  key: fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem"),
});

const wss = new WebSocketServer({ server });

let clients = {};

wss.on("connection", (ws) => {
  let username = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "register") {
      username = data.userName;
      clients[username] = ws;
      console.log(`User registered: ${username}`);
      return;
    }

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


server.listen(8080, "0.0.0.0", () => {
  console.log("Secure WebSocket server running");
});
