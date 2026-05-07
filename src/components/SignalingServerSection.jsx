import { useEffect, useState } from 'react';
import { useUser } from '../utils/UserContext';
import { IdentityManager } from '../utils/IdentityManager';
import { FiTrash2, FiPlus, FiCheck, FiServer, FiChevronDown, FiChevronUp, FiExternalLink, FiCopy } from 'react-icons/fi';

const identityManager = new IdentityManager();

// ── Self-hosting steps ─────────────────────────────────────
const HOSTING_STEPS = [
    {
        step: 1,
        title: "Get a server",
        description: "You need a Linux VPS with a public IP address. Any cloud provider works — DigitalOcean, Linode, AWS EC2, or a spare machine at home with port forwarding.",
        code: null,
    },
    {
        step: 2,
        title: "Install Node.js",
        description: "SSH into your server and install Node.js (v18 or higher).",
        code: "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt-get install -y nodejs",
    },
    {
        step: 3,
        title: "Clone the signaling server",
        description: "Clone the public signaling server repository and install dependencies.",
        code: "git clone https://github.com/your-org/signaling-server.git\ncd signaling-server\nnpm install",
    },
    {
        step: 4,
        title: "Start the server",
        description: "Run the signaling server. It listens on port 8080 by default.",
        code: "npm start\n# or to keep it running permanently:\nnpx pm2 start index.js --name signaling-server",
    },
    {
        step: 5,
        title: "Enable HTTPS / WSS (recommended)",
        description: "For production use, set up a domain with a free SSL certificate using Certbot so your server uses wss:// instead of ws://. Browsers require wss:// for WebRTC on HTTPS pages.",
        code: "sudo apt install certbot\nsudo certbot certonly --standalone -d yourdomain.com",
    },
    {
        step: 6,
        title: "Add your server URL here",
        description: "Once running, enter your server URL below in the format shown and click Add.",
        code: "wss://yourdomain.com:8080\n# or if no domain:\nws://YOUR_SERVER_IP:8080",
    },
];

// ── Code block component ───────────────────────────────────
function CodeBlock({ code }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="relative mt-2 bg-gray-900 rounded-lg overflow-hidden">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs flex items-center gap-1 transition"
            >
                <FiCopy size={12} />
                {copied ? 'Copied!' : 'Copy'}
            </button>
            <pre className="text-xs text-green-400 font-mono p-4 pr-16 overflow-x-auto whitespace-pre-wrap">
                {code}
            </pre>
        </div>
    );
}

// ── Self-hosting guide panel ───────────────────────────────
function SelfHostingGuide() {
    const [open, setOpen] = useState(false);
    const [expandedStep, setExpandedStep] = useState(null);

    return (
        <div className="border border-indigo-200 rounded-lg overflow-hidden">
            {/* Header toggle */}
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
                    <p className="text-sm text-gray-600">
                        You can run your own signaling server on any VPS or home server.
                        The server code is open source — follow the steps below to get it running in minutes.
                    </p>

                    {/* GitHub link */}
                    <a
                        href="https://github.com/ronishbrh/webrtc-signaling-server"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                        <FiExternalLink size={14} />
                        View signaling server source code on GitHub
                    </a>

                    {/* Steps */}
                    <div className="space-y-2 mt-2">
                        {HOSTING_STEPS.map((s) => (
                            <div key={s.step} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setExpandedStep(expandedStep === s.step ? null : s.step)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                                            {s.step}
                                        </span>
                                        <span className="text-sm font-medium text-gray-800">{s.title}</span>
                                    </div>
                                    {expandedStep === s.step
                                        ? <FiChevronUp size={14} className="text-gray-500" />
                                        : <FiChevronDown size={14} className="text-gray-500" />}
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

                    {/* Quick requirement checklist */}
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


// ── Main component ─────────────────────────────────────────
export default function SignalingServerSection() {
    const { identity } = useUser();
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newServerURL, setNewServerURL] = useState('');
    const [addingServer, setAddingServer] = useState(false);
    const [testingServers, setTestingServers] = useState({});

    useEffect(() => {
        if (!identity?.userName) { setLoading(false); return; }

        const loadServers = async () => {
            try {
                setLoading(true);

                const record = await identityManager._getObject("keys", identity.userName);

                const contacts = record.contacts || [];
                const userServers = record.signalingServers || [];

                const serverMap = new Map();

                userServers.forEach(s => {
                    serverMap.set(s.url, {
                        url: s.url,
                        owners: [s.owner || "You"],
                        status: 'checking'
                    });
                });


                contacts.forEach(contact => {
                    (contact.signalingServers || []).forEach(url => {

                        if (!serverMap.has(url)) {
                            serverMap.set(url, {
                                url,
                                owners: [contact.userName],
                                status: 'checking'
                            });
                        } else {
                            serverMap.get(url).owners.push(contact.userName);
                        }
                    });
                });

                setServers(Array.from(serverMap.values()));
                setError(null);

            } catch (err) {
                console.error(err);
                setError(err.message);
                setServers([]);
            } finally {
                setLoading(false);
            }
        };

        loadServers();
    }, [identity?.userName]);

    const testServer = async (serverURL) => {
        setTestingServers(prev => ({ ...prev, [serverURL]: 'checking' }));
        const timeout = setTimeout(() => {
            setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' }));
        }, 3000);
        try {
            const ws = new WebSocket(serverURL);
            ws.onopen = () => { clearTimeout(timeout); ws.close(); setTestingServers(prev => ({ ...prev, [serverURL]: 'online' })); };
            ws.onerror = () => { clearTimeout(timeout); setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' })); };
        } catch { clearTimeout(timeout); setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' })); }
    };

    useEffect(() => {
        servers.forEach(server => { if (!testingServers[server.url]) testServer(server.url); });
    }, [servers]);

    useEffect(() => {
        const loadActive = async () => {
            if (!identity?.userName) return;

            const active = await identityManager.getActiveSignallingServer(identity.userName);
            setActiveServer(active);
        };

        loadActive();
    }, [identity?.userName]);

    const handleSetActive = async (serverURL) => {
        try {
            await identityManager.setActiveSignallingServer(identity.userName, serverURL);
            setActiveServer(serverURL);
        } catch (err) { console.error('Failed to set active server:', err); alert('Failed to set active server'); }
    };

    const handleDeleteServer = async (serverURL) => {
        if (!confirm('Are you sure you want to delete this server?')) return;
        try {
            const contacts = await identityManager.getContacts(identity.userName);
            for (const contact of contacts) {
                if (contact.signalingServerURL === serverURL) {
                    await identityManager.updateContactSignalingServer(identity.userName, contact.userName, null);
                }
            }
            if (activeServer === serverURL) setActiveServer(null);
            setServers(servers.filter(s => s.url !== serverURL));
        } catch (err) { console.error('Failed to delete server:', err); alert('Failed to delete server'); }
    };

    const handleAddServer = async () => {
        if (!newServerURL.trim()) {
            alert('Please enter a valid server URL');
            return;
        }

        try {
            new URL(newServerURL);
        } catch {
            alert('Invalid URL format');
            return;
        }

        try {
            setAddingServer(true);

            if (servers.some(s => s.url === newServerURL)) {
                alert('This server URL already exists');
                return;
            }

            let serverStatus = 'checking';

            const ws = new WebSocket(newServerURL);

            ws.onopen = async () => {
                ws.close();

                await identityManager.addSignallingServer(
                    identity.userName,
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

            ws.onerror = () => {
                alert("Server is offline or unreachable");
                setAddingServer(false);
            };

        } catch (err) {
            console.error(err);
            alert('Failed to add server');
            setAddingServer(false);
        }
    };

    if (loading) {
        return <div className="bg-blue-50 border border-blue-200 rounded-lg p-4"><p className="text-blue-800">Loading servers...</p></div>;
    }

    const getStatusColor = (status) => ({ online: '🟢', offline: '🔴' }[status] || '🟡');
    const getStatusText = (status) => ({ online: 'Online', offline: 'Offline' }[status] || 'Checking...');

    return (
        <div className="space-y-4">

            {/* Active Server Info */}
            {activeServer && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-green-900 font-semibold mb-2">Currently Active Server</h3>
                    <p className="text-sm font-mono break-all text-gray-700">{activeServer}</p>
                </div>
            )}

            {/* ── SELF-HOSTING GUIDE ── */}
            <SelfHostingGuide />

            {/* Add New Server */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="text-purple-900 font-semibold mb-3">Add Signaling Server</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newServerURL}
                        onChange={(e) => setNewServerURL(e.target.value)}
                        placeholder="wss://yourdomain.com:8080"
                        className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddServer()}
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
                {servers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No servers configured yet. Add one above or host your own using the guide.</p>
                ) : (
                    <div className="space-y-3">
                        {servers.map((server) => {
                            const status = testingServers[server.url] || server.status;
                            const isActive = activeServer === server.url;
                            return (
                                <div key={server.url} className={`p-3 border rounded-lg transition ${isActive ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-300 hover:border-gray-400'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-mono break-all text-gray-700 mb-1">{server.url}</p>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">{getStatusColor(status)}</span>
                                                <span className="text-xs text-gray-600">{getStatusText(status)}</span>
                                                {isActive && <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Active</span>}
                                            </div>
                                            {server.owners && server.owners.length > 0 ? (
                                                <div className="text-xs text-gray-600"><p className="font-medium">Owner:</p><p className="ml-2">{server.owners.join(', ')}</p></div>
                                            ) : (
                                                <p className="text-xs text-gray-500 italic">No contacts using this server</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            {!isActive && (
                                                <button onClick={() => handleSetActive(server.url)} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition" title="Set as active server">
                                                    <FiCheck size={16} />
                                                </button>
                                            )}
                                            <button onClick={() => handleDeleteServer(server.url)} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded transition" title="Delete server">
                                                <FiTrash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 font-semibold">Error</p>
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}
        </div>
    );
}