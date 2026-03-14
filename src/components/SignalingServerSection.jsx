
import { useEffect, useState } from "react";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();
export default function SignalingServerSection() {
    const { identity } = useUser();

    const [servers, setServers] = useState([]);
    const [newServer, setNewServer] = useState("");
    const [checking, setChecking] = useState(false);
    const [activeServer, setActiveServer] = useState(null);

    const checkServer = (url) => {
        return new Promise((resolve) => {

            let ws;

            try {
                ws = new WebSocket(url);
            } catch {
                resolve("offline");
                return;
            }

            const timeout = setTimeout(() => {
                ws.close();
                resolve("offline");
            }, 3000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                resolve("online");
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                resolve("offline");
            };

        });
    };

    const loadServers = async () => {
        if (!identity) return

        setChecking(true)
        const urls = await identityManager.getSignallingServers(identity.userName);

        const result = await Promise.all(
            urls.map(async (url) => ({
                url,
                status: await checkServer(url)
            }))
        )

        setServers(result)
        setChecking(false)


    }

    const addServer = async () => {
        if (!newServer.trim()) return
        await identityManager.addSignallingServer(identity.userName, newServer);
        setNewServer("");
        loadServers();
    }

    const deleteServer = async (url) => {

        await identityManager.deleteSignallingServer(identity.userName, url);

        if (activeServer === url) setActiveServer(null);
        loadServers();
    };


    const handleUseServer = async (url) => {
        await identityManager.setActiveSignallingServer(identity.userName, url);
        setActiveServer(url);
    };

    useEffect(() => {
        if (!identity) return;

        const loadServersAndActive = async () => {
            setChecking(true);
            const urls = await identityManager.getSignallingServers(identity.userName);
            const result = await Promise.all(
                urls.map(async (url) => ({
                    url,
                    status: await checkServer(url)
                }))
            );

            const active = await identityManager.getActiveSignallingServer(identity.userName);

            setServers(result);
            if (!active && result.length > 0) {
                await identityManager.setActiveSignallingServer(identity.userName, result[0].url);
                setActiveServer(result[0].url);
            } else {
                setActiveServer(active);
            }
            setChecking(false);
        };

        loadServersAndActive();
    }, [identity]);

    return (
        <div className="p-4 max-w-xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4">
                Signaling Servers
            </h1>

            {/* Add Server */}
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="wss://server.example.com"
                    className="flex-1 p-2 border rounded"
                    value={newServer}
                    onChange={(e) => setNewServer(e.target.value)}
                />
                <button
                    onClick={addServer}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                    Add
                </button>
            </div>

            {/* Server List */}
            {checking && <p className="text-gray-500">Checking servers...</p>}

            <div className="space-y-3">
                {servers.map((server) => (
                    <div
                        key={server.url}
                        className="flex items-center justify-between p-3 border rounded"
                    >
                        <div className="flex flex-col">
                            <span className="text-sm break-all">{server.url}</span>
                            <span className="text-xs text-gray-500">
                                {server.status === "online" && "🟢 Online"}
                                {server.status === "offline" && "🔴 Offline"}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => handleUseServer(server.url)}
                                disabled={server.status === "offline"}
                                className={`text-green-600 text-sm ${activeServer === server.url ? "font-bold" : ""
                                    } ${server.status === "offline" ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                {activeServer === server.url ? "Active" : "Use"}
                            </button>

                            <button
                                onClick={() => deleteServer(server.url)}
                                className="text-red-500 text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}

                {servers.length === 0 && !checking && (
                    <p className="text-gray-500">No signalling servers added.</p>
                )}
            </div>

            {/* Active Server */}
            {activeServer && (
                <div className="mt-4 p-3 border rounded bg-green-50 break-all">
                    <span className="font-medium">Active Signaling Server:</span>
                    <div>{activeServer}</div>
                </div>
            )}
        </div>
    );
}