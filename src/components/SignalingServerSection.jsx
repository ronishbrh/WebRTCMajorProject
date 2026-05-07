import { useEffect, useState } from 'react';
import { useUser } from '../utils/UserContext';
import { FiTrash2, FiPlus, FiCheck } from 'react-icons/fi';


export default function SignalingServerSection() {
    const { identityManager } = useUser();
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newServerURL, setNewServerURL] = useState('');
    const [addingServer, setAddingServer] = useState(false);
    const [testingServers, setTestingServers] = useState({});


    useEffect(() => {
        if (!identityManager.getUserName()) {
            setLoading(false);
            return;
        }

        const loadServers = async () => {
            try {
                setLoading(true);

                const activeServerData = await identityManager.getActiveSignallingServer();
                let activeURL = null;

                if (activeServerData) {
                    if (typeof activeServerData === 'object' && activeServerData.url) {
                        activeURL = activeServerData.url;
                    } else if (typeof activeServerData === 'string') {
                        activeURL = activeServerData;
                    }
                }

                setActiveServer(activeURL);

                const contacts = await identityManager.getContacts();

                const serverMap = new Map();

                if (contacts && Array.isArray(contacts)) {
                    contacts.forEach(contact => {
                        if (contact.signalingServerURL) {
                            if (!serverMap.has(contact.signalingServerURL)) {
                                serverMap.set(contact.signalingServerURL, []);
                            }
                            serverMap.get(contact.signalingServerURL).push(contact.userName);
                        }
                    });
                }

                // Convert map to array
                const serverList = Array.from(serverMap.entries()).map(([url, owners]) => ({
                    url,
                    owners,
                    status: 'checking'
                }));

                setServers(serverList);
                setError(null);
            } catch (err) {
                console.error('Failed to load servers:', err);
                setError(err.message);
                setServers([]);
            } finally {
                setLoading(false);
            }
        };

        loadServers();
    }, [identityManager.getUserName()]);

    const testServer = async (serverURL) => {
        setTestingServers(prev => ({ ...prev, [serverURL]: 'checking' }));

        const timeout = setTimeout(() => {
            setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' }));
        }, 3000);

        try {
            const ws = new WebSocket(serverURL);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                setTestingServers(prev => ({ ...prev, [serverURL]: 'online' }));
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' }));
            };
        } catch {
            clearTimeout(timeout);
            setTestingServers(prev => ({ ...prev, [serverURL]: 'offline' }));
        }
    };

    //all servers on load
    useEffect(() => {
        servers.forEach(server => {
            if (!testingServers[server.url]) {
                testServer(server.url);
            }
        });
    }, [servers]);


    const handleSetActive = async (serverURL) => {
        try {
            await identityManager.setActiveSignallingServer(serverURL);
            setActiveServer(serverURL);
        } catch (err) {
            console.error('Failed to set active server:', err);
            alert('Failed to set active server');
        }
    };


    const handleDeleteServer = async (serverURL) => {
        if (!confirm('Are you sure you want to delete this server?')) {
            return;
        }

        try {
            // Remove all servers from contacts that use this URL
            const contacts = await identityManager.getContacts();

            for (const contact of contacts) {
                if (contact.signalingServerURL === serverURL) {
                    // Update contact to remove server
                    await identityManager.updateContactSignalingServer(
                        contact.userName,
                        null
                    );
                }
            }

            //clear active server if it's the one being deleted
            if (activeServer === serverURL) {
                setActiveServer(null);
            }

            setServers(servers.filter(s => s.url !== serverURL));
        } catch (err) {
            console.error('Failed to delete server:', err);
            alert('Failed to delete server');
        }
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
            const timeout = setTimeout(() => {
                serverStatus = 'offline';
            }, 3000);

            const ws = new WebSocket(newServerURL);

            ws.onopen = () => {
                clearTimeout(timeout);
                serverStatus = 'online';
                ws.close();
                finishAddingServer();
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                serverStatus = 'offline';
                finishAddingServer();
            };

            const finishAddingServer = () => {
                setServers([...servers, {
                    url: newServerURL,
                    owners: [],
                    status: serverStatus
                }]);
                setNewServerURL('');
                setTestingServers(prev => ({ ...prev, [newServerURL]: serverStatus }));

                if (!activeServer) {
                    setActiveServer(newServerURL);
                }
            };

        } catch (err) {
            console.error('Failed to add server:', err);
            alert('Failed to add server');
        } finally {
            setAddingServer(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">Loading servers...</p>
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'online': return '🟢';
            case 'offline': return '🔴';
            default: return '🟡';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'online': return 'Online';
            case 'offline': return 'Offline';
            default: return 'Checking...';
        }
    };

    return (
        <div className="space-y-4">
            {/* Active Server Info */}
            {activeServer && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-green-900 font-semibold mb-2">Currently Active Server</h3>
                    <p className="text-sm font-mono break-all text-gray-700">{activeServer}</p>
                </div>
            )}
            {/* Add New Server Section */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="text-purple-900 font-semibold mb-3">Add New Signaling Server</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newServerURL}
                        onChange={(e) => setNewServerURL(e.target.value)}
                        placeholder="Enter server URL (e.g., wss://...)"
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

                {servers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No servers configured yet. Add one above.</p>
                ) : (
                    <div className="space-y-3">
                        {servers.map((server) => {
                            const status = testingServers[server.url] || server.status;
                            const isActive = activeServer === server.url;

                            return (
                                <div
                                    key={server.url}
                                    className={`p-3 border rounded-lg transition ${isActive
                                            ? 'bg-blue-50 border-blue-300'
                                            : 'bg-white border-gray-300 hover:border-gray-400'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* Server URL */}
                                            <p className="text-sm font-mono break-all text-gray-700 mb-1">
                                                {server.url}
                                            </p>

                                            {/* Status */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">{getStatusColor(status)}</span>
                                                <span className="text-xs text-gray-600">{getStatusText(status)}</span>
                                                {isActive && (
                                                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                                                        Active
                                                    </span>
                                                )}
                                            </div>

                                            {/* Owners */}
                                            {server.owners && server.owners.length > 0 && (
                                                <div className="text-xs text-gray-600">
                                                    <p className="font-medium">Owner:</p>
                                                    <p className="ml-2">{server.owners.join(', ')}</p>
                                                </div>
                                            )}
                                            {(!server.owners || server.owners.length === 0) && (
                                                <p className="text-xs text-gray-500 italic">No contacts using this server</p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 flex-shrink-0">
                                            {!isActive && (
                                                <button
                                                    onClick={() => handleSetActive(server.url)}
                                                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                                                    title="Set as active server"
                                                >
                                                    <FiCheck size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteServer(server.url)}
                                                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded transition"
                                                title="Delete server"
                                            >
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
