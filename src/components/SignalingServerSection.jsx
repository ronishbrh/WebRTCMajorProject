import { useEffect, useState } from 'react';
import { useUser } from '../utils/UserContext';
import { FiTrash2, FiPlus, FiCheck, FiServer, FiChevronDown, FiChevronUp, FiExternalLink, FiCopy, FiSlash } from 'react-icons/fi';
import { importECDSAPrivateKey } from '../utils/crypto';


const HOSTING_STEPS = [
	{ step: 1, title: "Get a server", description: "You need a Linux VPS with a public IP address. Any cloud provider works — DigitalOcean, Linode, AWS EC2, or a spare machine at home with port forwarding.", code: null },
	{ step: 2, title: "Install Node.js", description: "SSH into your server and install Node.js (v18 or higher).", code: "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt-get install -y nodejs" },
	{ step: 3, title: "Clone the signaling server", description: "Clone the public signaling server repository and install dependencies.", code: "git clone https://github.com/your-org/signaling-server.git\ncd signaling-server\nnpm install" },
	{ step: 4, title: "Start the server", description: "Run the signaling server. It listens on port 8080 by default.", code: "npm start\n# or to keep it running permanently:\nnpx pm2 start index.js --name signaling-server" },
	{ step: 5, title: "Enable HTTPS / WSS (recommended)", description: "For production use, set up a domain with a free SSL certificate using Certbot so your server uses wss:// instead of ws://. Browsers require wss:// for WebRTC on HTTPS pages.", code: "sudo apt install certbot\nsudo certbot certonly --standalone -d yourdomain.com" },
	{ step: 6, title: "Add your server URL here", description: "Once running, enter your server URL below in the format shown and click Add.", code: "wss://yourdomain.com:8080\n# or if no domain:\nws://YOUR_SERVER_IP:8080" },
];

function CodeBlock({ code }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="relative mt-2 bg-gray-900 rounded-lg overflow-hidden">
			<button onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
				className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs flex items-center gap-1 transition">
				<FiCopy size={12} />
				{copied ? 'Copied!' : 'Copy'}
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
			<button onClick={() => setOpen(o => !o)}
				className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition text-left">
				<div className="flex items-center gap-2">
					<FiServer size={16} className="text-indigo-600" />
					<span className="text-indigo-900 font-semibold text-sm">Host your own signaling server</span>
					<span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">Self-host</span>
				</div>
				{open ? <FiChevronUp size={16} className="text-indigo-600" /> : <FiChevronDown size={16} className="text-indigo-600" />}
			</button>
			{open && (
				<div className="bg-white p-4 space-y-3">
					<p className="text-sm text-gray-600">You can run your own signaling server on any VPS or home server. The server code is open source — follow the steps below to get it running in minutes.</p>
					<a href="https://github.com/ronishbrh/webrtc-signaling-server" target="_blank" rel="noreferrer"
						className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
						<FiExternalLink size={14} />
						View signaling server source code on GitHub
					</a>
					<div className="space-y-2 mt-2">
						{HOSTING_STEPS.map(s => (
							<div key={s.step} className="border border-gray-200 rounded-lg overflow-hidden">
								<button onClick={() => setExpandedStep(expandedStep === s.step ? null : s.step)}
									className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-left">
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
							<li>Node.js v18 or higher</li>
							<li>Port 8080 open in firewall</li>
							<li>Domain + SSL certificate for wss:// (recommended)</li>
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

function toHttp(url) {
	if (!url) return "";
	if (url.startsWith("wss://")) return url.replace("wss://", "https://");
	if (url.startsWith("ws://")) return url.replace("ws://", "http://");
	return url;
}

async function exportPublicKeyBase64(publicKey) {
	const spki = await crypto.subtle.exportKey("spki", publicKey);
	return btoa(String.fromCharCode(...new Uint8Array(spki)));
}

async function authenticateWithServer(httpUrl, pubKeyBase64, privateKey) {

	const challengeRes = await fetch(`${httpUrl}/auth/challenge`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ publicKey: pubKeyBase64 }),
	});

	if (!challengeRes.ok) throw new Error("Challenge request failed");

	const { nonce } = await challengeRes.json();

	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } },
		await importECDSAPrivateKey(privateKey),
		new TextEncoder().encode(nonce)
	);

	const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

	const verifyRes = await fetch(`${httpUrl}/auth/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ publicKey: pubKeyBase64, signature: signatureBase64 }),
	});

	if (!verifyRes.ok) {
		const text = await verifyRes.text();
		if (text === "not approved") return null;
		throw new Error(`Verify failed: ${text}`);
	}

	const result = await verifyRes.json();
	return result;
}

export default function SignalingServerSection() {
	const { identityManager, closeAllSockets } = useUser();
	const [servers, setServers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [newServerURL, setNewServerURL] = useState('');
	const [addingServer, setAddingServer] = useState(false);
	const [testingServers, setTestingServers] = useState({});
	const [accessStatusMap, setAccessStatusMap] = useState({});
	const [revokingServers, setRevokingServers] = useState({});

	const checkAccessStatus = async (serverURL) => {
		const token = localStorage.getItem(`token_${toHttp(serverURL)}`);
		if (!token) { setAccessStatusMap(prev => ({ ...prev, [serverURL]: "unknown" })); return; }
		try {
			const res = await fetch(`${toHttp(serverURL)}/auth/status`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) { setAccessStatusMap(prev => ({ ...prev, [serverURL]: "unknown" })); return; }
			const data = await res.json();
			setAccessStatusMap(prev => ({ ...prev, [serverURL]: data.approved ? "approved" : "pending" }));
		} catch {
			setAccessStatusMap(prev => ({ ...prev, [serverURL]: "unknown" }));
		}
	};

	const requestAccess = async (serverURL) => {
		try {
			const httpURL = toHttp(serverURL);
			const pubKeyBase64 = identityManager.getPublicKey();

			const res = await fetch(`${httpURL}/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ publicKey: pubKeyBase64, message: `Request access to server: ${serverURL}, from: ${pubKeyBase64}` })
			});
			if (!res.ok) throw new Error("Registration failed");

			const { token, own } = await authenticateWithServer(httpURL, identityManager.getPublicKey(), identityManager.getPrivateKey());

			if (token) {
				localStorage.setItem(`token_${httpURL}`, token);
				await registerSignallingServerAccess(serverURL);
				setAccessStatusMap(prev => ({ ...prev, [serverURL]: "approved" }));
				alert("✅ Access granted!");
			} else {
				setAccessStatusMap(prev => ({ ...prev, [serverURL]: "pending" }));
				alert("Request sent! Waiting for admin approval.");
			}
		} catch (err) {
			console.error(err);
			alert("Failed to send request: " + err.message);
		}
	};

	// ── Self-revoke: user removes themselves from the server ──────────────────
	const revokeAccess = async (serverURL) => {
		if (!confirm(`Remove yourself from ${serverURL}?\n\nYou will no longer be able to connect to this server until an admin re-approves you.`)) return;

		setRevokingServers(prev => ({ ...prev, [serverURL]: true }));
		try {
			const httpURL = toHttp(serverURL);
			const tokenKey = `token_${httpURL}`;
			let token = localStorage.getItem(tokenKey);

			// If token expired or missing, re-authenticate first
			if (!token) {
				token = await authenticateWithServer(httpURL, identityManager.getPublicKey(), identityManager.getPrivateKey());
				if (!token) { alert("You are not approved on this server — nothing to revoke."); return; }
				localStorage.setItem(tokenKey, token);
			}

			const pubKeyBase64 = identityManager.getPublicKey();

			const res = await fetch(`${httpURL}/admin/remove`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ publicKey: pubKeyBase64 }),
			});

			if (res.status === 403) {
				// Token rejected — server may require admin role for /admin/remove.
				// Fall back to clearing local state only.
				localStorage.removeItem(tokenKey);
				setAccessStatusMap(prev => ({ ...prev, [serverURL]: "unknown" }));
				alert("⚠️ Server requires admin rights to remove users remotely.\nYour local access token has been cleared — you are effectively disconnected from this server.");
				return;
			}

			if (!res.ok) throw new Error(await res.text());

			// Success — clear token and update UI
			localStorage.removeItem(tokenKey);
			await revokeSignallingServerAccess(serverURL);
			setAccessStatusMap(prev => ({ ...prev, [serverURL]: "unknown" }));
			alert("✅ Access revoked. You have been removed from this server.");

		} catch (err) {
			console.error(err);
			alert("Failed to revoke access: " + err.message);
		} finally {
			setRevokingServers(prev => ({ ...prev, [serverURL]: false }));
		}
	};

	// ── Polling ───────────────────────────────────────────────────────────────
	useEffect(() => {
		if (!identityManager || servers.length === 0) return;

		const poll = async () => {
			for (const server of servers) {
				const currentStatus = accessStatusMap[server.url];
				if (currentStatus === "approved") {
					await checkAccessStatus(server.url);
				} else {
					try {
						const token = await authenticateWithServer(toHttp(server.url), identityManager.getPublicKey, identityManager.getPrivateKey());
						if (token) {
							localStorage.setItem(`token_${toHttp(server.url)}`, token);
							await registerSignallingServerAccess(serverURL);
							setAccessStatusMap(prev => ({ ...prev, [server.url]: "approved" }));
						} else if (!accessStatusMap[server.url]) {
							setAccessStatusMap(prev => ({ ...prev, [server.url]: "pending" }));
						}
					} catch { /* unreachable */ }
				}
			}
		};

		poll();
		const interval = setInterval(poll, 5000);
		return () => clearInterval(interval);
	}, [identityManager?.getUserName(), servers, accessStatusMap]);

	// ── Load servers ──────────────────────────────────────────────────────────
	useEffect(() => {
		if (!identityManager.getUserName()) {
			setLoading(false);
			return;
		}

		const loadServers = async () => {
			try {
				setLoading(true);
				const contacts = identityManager.getContacts();
				const userServers = identityManager.getSignallingServers();

				const serverMap = new Map();

				userServers.forEach(s => {
					const url = typeof s === "string" ? s : s?.url;
					if (!url) return;
					const clean = url.trim();
					if (!serverMap.has(clean)) serverMap.set(clean, { url: clean, owners: ["You"] });
					else serverMap.get(clean).owners.push("You");
				});

				contacts.forEach(contact => {
					(contact.signalingServers || contact.s || []).forEach(s => {
						const url = typeof s === "string" ? s : s?.url;
						if (!url) return;
						const clean = url.trim();
						if (!serverMap.has(clean)) serverMap.set(clean, { url: clean, owners: [contact.userName || "Unknown"] });
						else serverMap.get(clean).owners.push(contact.userName || "Unknown");
					});
				});

				setServers(Array.from(serverMap.values()));
				setError(null);
			} catch (err) {
				setError(err.message);
				setServers([]);
			} finally {
				setLoading(false);
			}
		};

		loadServers();
		return closeAllSockets;
	}, [identityManager.getUserName()]);

	// ── Test connectivity ─────────────────────────────────────────────────────
	const testServer = (serverURL) => {
		setTestingServers(prev => ({ ...prev, [serverURL]: 'checking' }));
		const t = setTimeout(() => setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' })), 3000);
		try {
			const ws = new WebSocket(serverURL);
			ws.onopen = () => { clearTimeout(t); ws.close(); setTestingServers(prev => ({ ...prev, [serverURL]: 'online' })); };
			ws.onerror = () => { clearTimeout(t); setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' })); };
		} catch { clearTimeout(t); setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' })); }
	};

	useEffect(() => {
		servers.forEach(s => { if (!testingServers[s.url]) testServer(s.url); });
	}, [servers]);


	const handleDeleteServer = async (serverURL) => {
		if (!confirm('Remove this server from your list?')) return;
		try {
			// Remove all servers from contacts that use this URL
			const contacts = identityManager.getContacts();

			for (const contact of contacts) {
				if (contact.signalingServers.includes(serverURL)) {
					await identityManager.removeContactSignallingServer(
						contact.userName,
						serverURL
					);
				}
			}
			setServers(servers.filter(s => s.url !== serverURL));
			localStorage.removeItem(`token_${toHttp(serverURL)}`);
			setAccessStatusMap(prev => { const c = { ...prev }; delete c[serverURL]; return c; });
		} catch { alert('Failed to delete server'); }
	};

	const handleAddServer = async () => {
		if (!newServerURL.trim()) { alert('Please enter a valid server URL'); return; }
		try { new URL(newServerURL); } catch { alert('Invalid URL format'); return; }
		if (servers.some(s => s.url === newServerURL)) { alert('This server URL already exists'); return; }

		setAddingServer(true);
		try {
			const ws = new WebSocket(newServerURL);
			ws.onopen = async () => {
				ws.close();
				await identityManager.addSignallingServer(
					newServerURL,
					"manual"
				);

				setServers(prev => [
					...prev,
					{
						url: newServerURL,
						owners: ["You"],
						status: "online"
					}
				]);

				setNewServerURL('');
				setAddingServer(false);
			};
			ws.onerror = () => { alert("Server is offline or unreachable"); setAddingServer(false); };
		} catch { alert('Failed to add server'); setAddingServer(false); }
	};

	if (loading) return <div className="bg-blue-50 border border-blue-200 rounded-lg p-4"><p className="text-blue-800">Loading servers...</p></div>;

	const getStatusColor = s => ({ online: '🟢', offline: '🔴' }[s] || '🟡');
	const getStatusText = s => ({ online: 'Online', offline: 'Offline' }[s] || 'Checking...');

	return (
		<div className="space-y-4">
			<SelfHostingGuide />

			{/* Add New Server */}
			<div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
				<h3 className="text-purple-900 font-semibold mb-3">Add Signaling Server</h3>
				<div className="flex gap-2">
					<input type="text" value={newServerURL} onChange={e => setNewServerURL(e.target.value)}
						placeholder="wss://yourdomain.com:8080"
						className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
						onKeyUp={(e) => e.key === 'Enter' && handleAddServer()}
					/>
					<button
						onClick={handleAddServer}
						disabled={addingServer || !newServerURL.trim()}
						className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg flex items-center gap-2 transition"
					>
						<FiPlus size={18} />
						Add
					</button>
				</div>
			</div>

			{/* Servers List */}
			<div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
				<h3 className="text-gray-900 font-semibold mb-3">Your Signaling Servers</h3>
				{servers.length === 0
					? <p className="text-gray-500 text-sm">No servers configured yet.</p>
					: (
						<div className="space-y-3">
							{servers.map(server => {
								const status = testingServers[server.url] || server.status;
								const accessStatus = accessStatusMap[server.url] || "unknown";
								const isRevoking = revokingServers[server.url];

								return (
									<div key={server.url}
										className={`p-3 border rounded-lg transition 'bg-white border-gray-300 hover:border-gray-400'`}>
										<div className="flex items-start justify-between gap-3 flex-wrap">
											<div className="flex-1 min-w-0">
												<p className="text-sm font-mono break-all text-gray-700 mb-1">{server.url}</p>
												<div className="flex items-center gap-2 mb-2">
													<span className="text-lg">{getStatusColor(status)}</span>
													<span className="text-xs text-gray-600">{getStatusText(status)}</span>
												</div>
												{server.owners?.length > 0
													? <div className="text-xs text-gray-600"><p className="font-medium">Owner:</p><p className="ml-2">{server.owners.join(', ')}</p></div>
													: <p className="text-xs text-gray-500 italic">No contacts using this server</p>
												}
											</div>

											<div className="flex gap-2 flex-shrink-0 items-start flex-wrap">
												{/* Request Access — only if not approved */}
												{accessStatus !== "approved" && (
													<button onClick={() => requestAccess(server.url)}
														className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition text-xs">
														{accessStatus === "pending" ? "Re-request" : "Request Access"}
													</button>
												)}

												{/* Revoke Access — only if approved */}
												{accessStatus === "approved" && (
													<button
														onClick={() => revokeAccess(server.url)}
														disabled={isRevoking}
														className="px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded transition text-xs flex items-center gap-1"
														title="Remove yourself from this server"
													>
														<FiSlash size={12} />
														{isRevoking ? "Revoking…" : "Revoke Access"}
													</button>
												)}

												<button onClick={() => handleDeleteServer(server.url)}
													className="p-2 bg-red-500 hover:bg-red-600 text-white rounded transition" title="Remove from list">
													<FiTrash2 size={16} />
												</button>
											</div>
										</div>

										{/* Access status badge */}
										<div className="mt-2 text-sm font-semibold">
											{accessStatus === "approved" && <span className="text-green-600">✅ You have access to this server</span>}
											{accessStatus === "pending" && <span className="text-yellow-600">⏳ Waiting for admin approval...</span>}
											{accessStatus === "unknown" && <span className="text-gray-400 font-normal">Click "Request Access" to register with this server</span>}
										</div>
									</div>
								);
							})
							}
						</div >
					)
				}
			</div >

			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-4">
					<p className="text-red-800 font-semibold">Error</p>
					<p className="text-red-700 text-sm">{error}</p>
				</div>
			)}
		</div >
	);
}
