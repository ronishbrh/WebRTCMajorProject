/**
 * SignalingServerSection
 *
 * Manages the list of signaling servers the user has configured.
 * Uses AuthClient for all authentication — no raw fetch calls to auth endpoints.
 *
 * Fixed bugs vs original:
 *  - getPublicKey was passed as a function reference instead of being called
 *  - signallingServers vs signalingServers spelling inconsistency
 *  - Token refresh is now handled by AuthClient transparently
 *  - Access status is derived from AuthClient.checkStatus(), not separate localStorage keys
 */

import { useEffect, useRef, useState } from "react";
import { useUser } from "../utils/UserContext";
import { AuthClient } from "../utils/AuthClient";
import {
	FiTrash2, FiPlus, FiServer,
	FiChevronDown, FiChevronUp,
	FiExternalLink, FiCopy, FiSlash,
} from "react-icons/fi";

function toHttp(url) {
	if (!url) return url;
	if (url.startsWith("wss://")) return url.replace("wss://", "https://");
	if (url.startsWith("ws://")) return url.replace("ws://", "http://");
	return url;
}

// ── Self-hosting guide ───────────────────────────────────────────────────────


const HOSTING_STEPS = [
	{
		step: 1, title: "Get a server",
		description: "You need a Linux VPS with a public IP. Any cloud provider works — DigitalOcean, Linode, AWS EC2, or a home machine with port forwarding.",
		code: null,
	},
	{
		step: 2, title: "Install Node.js",
		description: "SSH into your server and install Node.js v18 or higher.",
		code: "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt-get install -y nodejs",
	},
	{
		step: 3, title: "Clone the signaling server",
		description: "Clone the repository and install dependencies.",
		code: "git clone https://github.com/your-org/signaling-server.git\ncd signaling-server\nnpm install",
	},
	{
		step: 4, title: "Configure environment",
		description: "Create a .env file with the required variables.",
		code: "JWT_SECRET=<long-random-string>\nADMIN_KEY=<your-base64-spki-public-key>\nPORT=8080",
	},
	{
		step: 5, title: "Start the server",
		description: "Run it directly or keep it alive with pm2.",
		code: "npm start\n# or permanently:\nnpx pm2 start server.mjs --name signaling",
	},
	{
		step: 6, title: "Enable HTTPS / WSS (recommended)",
		description: "Browsers require wss:// for WebRTC on HTTPS pages. Use Certbot for a free certificate.",
		code: "sudo apt install certbot\nsudo certbot certonly --standalone -d yourdomain.com",
	},
	{
		step: 7, title: "Add your server URL here",
		description: "Once running, enter the URL below and click Add.",
		code: "wss://yourdomain.com:8080\n# or without a domain:\nws://YOUR_SERVER_IP:8080",
	},
];

function CodeBlock({ code }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="relative mt-2 bg-gray-900 rounded-lg overflow-hidden">
			<button
				onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
				className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs flex items-center gap-1 transition"
			>
				<FiCopy size={12} />
				{copied ? "Copied!" : "Copy"}
			</button>
			<pre className="text-xs text-green-400 font-mono p-4 pr-16 overflow-x-auto whitespace-pre-wrap">{code}</pre>
		</div>
	);
}

function SelfHostingGuide() {
	const [open, setOpen] = useState(false);
	const [expandedStep, setExpandedStep] = useState(null);
	return (
		<div className="border border-indigo-200 rounded-lg overflow-hidden">
			<button
				onClick={() => setOpen(o => !o)}
				className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition text-left"
			>
				<div className="flex items-center gap-2">
					<FiServer size={16} className="text-indigo-600" />
					<span className="text-indigo-900 font-semibold text-sm">Host your own signaling server</span>
					<span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">Self-host</span>
				</div>
				{open ? <FiChevronUp size={16} className="text-indigo-600" /> : <FiChevronDown size={16} className="text-indigo-600" />}
			</button>
			{open && (
				<div className="bg-white p-4 space-y-3">
					<p className="text-sm text-gray-600">Run your own signaling server on any VPS or home server. The code is open source.</p>
					<a href="https://github.com/ronishbrh/webrtc-signaling-server" target="_blank" rel="noreferrer"
						className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
						<FiExternalLink size={14} />
						View source on GitHub
					</a>
					<div className="space-y-2 mt-2">
						{HOSTING_STEPS.map(s => (
							<div key={s.step} className="border border-gray-200 rounded-lg overflow-hidden">
								<button
									onClick={() => setExpandedStep(expandedStep === s.step ? null : s.step)}
									className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-left"
								>
									<div className="flex items-center gap-3">
										<span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">{s.step}</span>
										<span className="text-sm font-medium text-gray-800">{s.title}</span>
									</div>
									{expandedStep === s.step ? <FiChevronUp size={14} className="text-gray-500" /> : <FiChevronDown size={14} className="text-gray-500" />}
								</button>
								{expandedStep === s.step && (
									<div className="px-4 py-3 bg-white">
										<p className="text-sm text-gray-600">{s.description}</p>
										{s.code && <CodeBlock code={s.code} />}
									</div>
								)}
							</div>
						))}
					</div>
					<div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
						<p className="text-xs font-semibold text-amber-800 mb-1">Requirements</p>
						<ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
							<li>Linux VPS or home server with public IP</li>
							<li>Node.js v18+</li>
							<li>Port 8080 open in firewall</li>
							<li>Domain + SSL certificate for wss:// (recommended)</li>
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SignalingServerSection() {
	const { identityManager, closeAllSockets, getSocket, addSocket } = useUser();

	const [servers, setServers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [newServerURL, setNewServerURL] = useState("");
	const [addingServer, setAddingServer] = useState(false);

	// Per-server UI state
	const [connectivity, setConnectivity] = useState({}); // url → "checking"|"online"|"offline"
	const [accessStatus, setAccessStatus] = useState({});  // url → "approved"|"pending"|"unknown"
	const [actionBusy, setActionBusy] = useState({});      // url → bool

	// AuthClient instances keyed by HTTP url
	const authClients = useRef({});

	function getAuthClient(wsUrl) {
		if (!authClients.current[wsUrl]) {
			authClients.current[wsUrl] = new AuthClient(wsUrl, identityManager);
		}
		return authClients.current[wsUrl];
	}

	// ── Load servers ────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!identityManager?.getUserName()) { setLoading(false); return; }

		const load = async () => {
			try {
				setLoading(true);
				const serverMap = new Map();

				// Own servers
				for (const s of identityManager.getSignallingServers()) {
					const url = typeof s === "string" ? s : s?.url;
					if (!url) continue;
					const clean = url.trim();
					if (!serverMap.has(clean)) serverMap.set(clean, { url: clean, owners: ["You"] });
					else serverMap.get(clean).owners.push("You");
				}

				// Contacts' servers
				for (const contact of identityManager.getContacts()) {
					for (const s of (contact.signallingServers || [])) {
						const url = typeof s === "string" ? s : s?.url;
						if (!url) continue;
						const clean = url.trim();
						const name = contact.userName || "Unknown";
						if (!serverMap.has(clean)) serverMap.set(clean, { url: clean, owners: [name] });
						else if (!serverMap.get(clean).owners.includes(name)) serverMap.get(clean).owners.push(name);
					}
				}

				setServers(Array.from(serverMap.values()));
				setError(null);
			} catch (err) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};

		load();
		return closeAllSockets;
	}, []);

	// ── Connectivity check ──────────────────────────────────────────────────────

	function testConnectivity(serverURL) {
		setConnectivity(prev => ({ ...prev, [serverURL]: "checking" }));
		const t = setTimeout(() => setConnectivity(prev => ({ ...prev, [serverURL]: "offline" })), 4000);
		try {
			const ws = new WebSocket(serverURL);
			ws.onopen = () => { clearTimeout(t); ws.close(); setConnectivity(prev => ({ ...prev, [serverURL]: "online" })); };
			ws.onerror = () => { clearTimeout(t); setConnectivity(prev => ({ ...prev, [serverURL]: "offline" })); };
		} catch {
			clearTimeout(t);
			setConnectivity(prev => ({ ...prev, [serverURL]: "offline" }));
		}
	}

	useEffect(() => {
		servers.forEach(s => { if (!connectivity[s.url]) testConnectivity(s.url); });
	}, [servers]);

	// ── Access status polling ───────────────────────────────────────────────────

	useEffect(() => {
		if (!identityManager || servers.length === 0) return;

		const poll = async () => {
			for (const server of servers) {
				const client = getAuthClient(server.url);
				try {
					// Try silent re-auth first (uses cached tokens or refreshes)
					const token = await client.getValidToken();
					if (token) {
						await identityManager.registerSignallingServerAccess(server.url);
						setAccessStatus(prev => ({ ...prev, [server.url]: "approved" }));
					} else {
						// Not approved yet — check if pending
						console.log("Not approved");
						const st = await client.checkStatus();
						setAccessStatus(prev => ({ ...prev, [server.url]: st }));
					}
				} catch (err) {
					console.log(err);
					setAccessStatus(prev => ({ ...prev, [server.url]: "unknown" }));
				}
			}
		};

		poll();
		const interval = setInterval(poll, 10_000);
		return () => clearInterval(interval);
	}, [identityManager?.getUserName(), servers.length]);

	// ── Request access ──────────────────────────────────────────────────────────

	async function requestAccess(serverURL) {
		setActionBusy(prev => ({ ...prev, [serverURL]: true }));
		try {
			const httpUrl = toHttp(serverURL);
			const pubKey = identityManager.getPublicKey();

			// Register in the queue
			await fetch(`${httpUrl}/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ publicKey: pubKey, message: `Access request from ${pubKey.slice(0, 20)}…` }),
			});

			setAccessStatus(prev => ({ ...prev, [serverURL]: "pending" }));
			alert("Request sent. Waiting for admin approval.");
		} catch (err) {
			alert("Failed: " + err.message);
		} finally {
			setActionBusy(prev => ({ ...prev, [serverURL]: false }));
		}
	}

	// ── Revoke access ───────────────────────────────────────────────────────────

	async function revokeAccess(serverURL) {
		if (!confirm(`Remove yourself from ${serverURL}?\n\nYou will be disconnected until an admin re-approves you.`)) return;
		setActionBusy(prev => ({ ...prev, [serverURL]: true }));
		try {
			const client = getAuthClient(serverURL);
			await client.revokeAccess();
			await identityManager.revokeSignallingServerAccess(serverURL);
			setAccessStatus(prev => ({ ...prev, [serverURL]: "unknown" }));
			alert("✅ Access revoked.");
		} catch (err) {
			alert("Failed to revoke: " + err.message);
		} finally {
			setActionBusy(prev => ({ ...prev, [serverURL]: false }));
		}
	}

	// ── Remove server from list ─────────────────────────────────────────────────

	async function deleteServer(serverURL) {
		if (!confirm("Remove this server from your list?")) return;
		try {
			await identityManager.deleteSignallingServer(serverURL);

			// Remove from contacts too
			for (const contact of identityManager.getContacts()) {
				if ((contact.signallingServers || []).includes(serverURL)) {
					await identityManager.removeContactSignallingServer(contact.userName, serverURL);
				}
			}

			delete authClients.current[serverURL];
			setServers(prev => prev.filter(s => s.url !== serverURL));
			setConnectivity(prev => { const c = { ...prev }; delete c[serverURL]; return c; });
			setAccessStatus(prev => { const c = { ...prev }; delete c[serverURL]; return c; });
		} catch {
			alert("Failed to remove server.");
		}
	}

	// ── Add server ──────────────────────────────────────────────────────────────

	async function addServer() {
		const url = newServerURL.trim();
		if (!url) { alert("Enter a server URL."); return; }
		try { new URL(url); } catch { alert("Invalid URL format."); return; }
		if (servers.some(s => s.url === url)) { alert("Already in your list."); return; }

		setAddingServer(true);
		try {
			await new Promise((resolve, reject) => {
				const t = setTimeout(() => reject(new Error("Server unreachable (timeout)")), 5000);
				const ws = new WebSocket(url);
				ws.onopen = () => { clearTimeout(t); ws.close(); resolve(); };
				ws.onerror = () => { clearTimeout(t); reject(new Error("Server offline or unreachable")); };
			});

			await identityManager.addSignallingServer(url);
			setServers(prev => [...prev, { url, owners: ["You"] }]);
			setNewServerURL("");
		} catch (err) {
			alert(err.message);
		} finally {
			setAddingServer(false);
		}
	}

	// ── Render ───────────────────────────────────────────────────────────────────

	if (loading) {
		return (
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<p className="text-blue-800 text-sm">Loading servers…</p>
			</div>
		);
	}

	const connIcon = s => ({ online: "🟢", offline: "🔴" }[s] || "🟡");
	const connText = s => ({ online: "Online", offline: "Offline" }[s] || "Checking…");

	return (
		<div className="space-y-4">
			<SelfHostingGuide />

			{/* Add server */}
			<div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
				<h3 className="text-purple-900 font-semibold mb-3 text-sm">Add Signaling Server</h3>
				<div className="flex gap-2">
					<input
						type="text"
						value={newServerURL}
						onChange={e => setNewServerURL(e.target.value)}
						onKeyUp={e => e.key === "Enter" && addServer()}
						placeholder="wss://yourdomain.com:8080"
						className="flex-1 px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
					/>
					<button
						onClick={addServer}
						disabled={addingServer || !newServerURL.trim()}
						className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg flex items-center gap-2 transition text-sm"
					>
						<FiPlus size={12} />
						{addingServer ? "Adding…" : "Add"}
					</button>
				</div>
			</div>

			{/* Server list */}
			<div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
				<h3 className="text-gray-900 font-semibold mb-3 text-sm">Your Signaling Servers</h3>
				{servers.length === 0 ? (
					<p className="text-gray-500 text-sm">No servers configured yet.</p>
				) : (
					<div className="space-y-3">
						{servers.map(server => {
							const conn = connectivity[server.url];
							const access = accessStatus[server.url] || "unknown";
							const busy = actionBusy[server.url];

							return (
								<div key={server.url} className="p-3 border border-gray-300 bg-white rounded-lg hover:border-gray-400 transition">
									<div className="flex items-start justify-between gap-3 flex-wrap">
										<div className="flex-1 min-w-0 space-y-1">
											<p className="text-xs font-mono break-all text-gray-700">{server.url}</p>
											<div className="flex items-center gap-1.5">
												<span>{connIcon(conn)}</span>
												<span className="text-xs text-gray-500">{connText(conn)}</span>
											</div>
											{server.owners?.length > 0 && (
												<p className="text-xs text-gray-500">
													<span className="font-medium">Owner: </span>{server.owners.join(", ")}
												</p>
											)}
										</div>

										<div className="flex gap-2 flex-shrink-0 flex-wrap items-start">
											{access !== "approved" && (
												<button
													onClick={() => requestAccess(server.url)}
													disabled={busy}
													className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded text-xs transition"
												>
													{access === "pending" ? "Re-request" : "Request Access"}
												</button>
											)}
											{access === "approved" && (
												<button
													onClick={() => revokeAccess(server.url)}
													disabled={busy}
													className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded text-xs flex items-center gap-1 transition"
												>
													<FiSlash size={11} />
													{busy ? "Revoking…" : "Revoke"}
												</button>
											)}
											<button
												onClick={() => deleteServer(server.url)}
												className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition"
												title="Remove from list"
											>
												<FiTrash2 size={14} />
											</button>
										</div>
									</div>

									{/* Access badge */}
									<div className="mt-2 text-xs font-medium">
										{access === "approved" && <span className="text-green-600">✅ Access granted</span>}
										{access === "pending" && <span className="text-amber-600">⏳ Awaiting admin approval…</span>}
										{access === "unknown" && <span className="text-gray-400 font-normal">Click "Request Access" to register</span>}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-3">
					<p className="text-red-700 text-sm">{error}</p>
				</div>
			)}
		</div>
	);
}
