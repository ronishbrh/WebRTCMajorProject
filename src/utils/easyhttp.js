import https from "https";
import WebSocket from "ws";
import crypto from "crypto";

function parseServer(serverUrl) {
	const url = new URL(serverUrl);

	return {
		protocol: url.protocol,
		hostname: url.hostname,
		port: url.port || (url.protocol === "https:" ? 443 : 80)
	};
}


export function httpsRequest(serverUrl, path, method = "GET", data = null) {

	const { hostname, port } = parseServer(serverUrl);

	return new Promise((resolve, reject) => {

		const options = {
			hostname,
			port,
			path,
			method,
			headers: {
				"Content-Type": "application/json"
			}
		};

		const req = https.request(options, (res) => {

			let body = "";

			res.on("data", (chunk) => {
				body += chunk;
			});

			res.on("end", () => {

				if (res.statusCode >= 200 && res.statusCode < 300) {

					try {
						resolve(JSON.parse(body));
					} catch {
						resolve(body);
					}

				} else {
					reject(new Error(`HTTP ${res.statusCode}: ${body}`));
				}

			});

		});

		req.on("error", (err) => {
			reject(new Error(`Request failed: ${err.message}`));
		});

		let timeout = 5000
		req.setTimeout(timeout, () => {
			req.destroy(); // abort request
			reject(new Error(`Request timeout after ${timeout}ms`));
		});

		if (data) {
			try {
				req.write(JSON.stringify(data));
			} catch (err) {
				reject(new Error(`Failed to serialize request data: ${err.message}`));
			}
		}

		req.end();
	});
}


export async function register(serverUrl, publicKey, message = "") {

	try {

		const res = await httpsRequest(
			serverUrl,
			"/register",
			"POST",
			{ publicKey, message }
		);

		console.log("Registration request submitted:", res);
		return res;

	} catch (err) {

		console.error("Registration error:", err.message);
		throw err;

	}
}

export async function requestChallenge(serverUrl, publicKey) {

	try {

		const res = await httpsRequest(
			serverUrl,
			"/auth/challenge",
			"POST",
			{ publicKey }
		);

		return res.nonce;

	} catch (err) {

		console.error("Challenge request error:", err.message);
		throw err;

	}
}



export async function getToken(serverUrl, publicKey, privateKey) {

	try {

		const nonce = await requestChallenge(serverUrl, publicKey);

		const sign = crypto.createSign("SHA256");
		sign.update(nonce);
		sign.end();

		const signature = sign.sign(privateKey, "hex");

		const res = await httpsRequest(
			serverUrl,
			"/auth/verify",
			"POST",
			{ publicKey, signature }
		);

		return res.token;

	} catch (err) {

		console.error("Token generation error:", err.message);
		throw err;

	}
}


export function connectWebSocket(serverUrl, token) {

	try {

		const url = new URL(serverUrl);

		const protocol = url.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${url.host}?token=${token}`;

		const ws = new WebSocket(wsUrl);

		ws.on("open", () => {
			console.log("WebSocket connected successfully!");
		});

		ws.on("message", (msg) => {
			try {
				const data = JSON.parse(msg);
				console.log("Received message:", data);
			} catch {
				console.log("Received non-JSON message:", msg.toString());
			}
		});

		ws.on("close", (code, reason) => {
			console.warn(`WebSocket closed: [${code}] ${reason}`);
		});

		ws.on("error", (err) => {
			console.error("WebSocket error:", err.message);
		});

		return ws;

	} catch (err) {

		console.error("WebSocket connection error:", err.message);
		throw err;

	}
}


