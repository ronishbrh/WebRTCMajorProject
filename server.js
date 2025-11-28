import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

console.log("WebSocket signaling server running on ws://localhost:8080");

let clients = [];

wss.on("connection", (ws) => {
	console.log("Client connected");


	clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(JSON.stringify({ type: "join" }));
		}
	});

	clients.push(ws);

	ws.on("message", (data) => {
		const msg = data.toString();
		console.log("Received:", msg);

		// broadcast to all OTHER clients
		clients.forEach((client) => {
			if (client !== ws && client.readyState === 1) {
				client.send(msg);
			}
		});
	});

	ws.on("close", () => {
		console.log("Client disconnected");
		clients = clients.filter((c) => c !== ws);
	});
});
