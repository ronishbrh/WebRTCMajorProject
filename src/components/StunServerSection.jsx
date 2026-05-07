import { useState, useEffect } from "react";
import { useUser } from "../utils/UserContext";


export default function StunServerSection() {
    const { identitiyManager } = useUser()

    const [servers, setServers] = useState([]);
    const [input, setInput] = useState("");
    const [active, setActive] = useState(null);
    const [pingResults, setPingResults] = useState({});

    const addServer = async () => {

        if (!input) return;

        await identityManager.addStunServer(input);

        const updated = await identityManager.getStunServers();

        setServers(updated);
        setInput("");

    };


    const deleteServer = async (url) => {

        await identityManager.deleteStunServer(url);

        const updated = await identityManager.getStunServers();

        setServers(updated);

    };

    const pingServer = async (server) => {

        setPingResults((prev) => ({ ...prev, [server]: "checking" }));

        const start = Date.now();

        try {

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: server }]
            });

            pc.createDataChannel("test");

            let success = false;

            pc.onicecandidate = (event) => {

                if (event.candidate && event.candidate.candidate.includes("srflx")) {

                    success = true;

                    const latency = Date.now() - start;

                    setPingResults((prev) => ({
                        ...prev,
                        [server]: latency + " ms"
                    }));

                    pc.close();
                }
            };

            const offer = await pc.createOffer();

            await pc.setLocalDescription(offer);

            setTimeout(() => {

                if (!success) {

                    setPingResults((prev) => ({
                        ...prev,
                        [server]: "failed"
                    }));

                    pc.close();

                }

            }, 4000);

        } catch {

            setPingResults((prev) => ({
                ...prev,
                [server]: "failed"
            }));

        }

    };

    const useServer = (server) => {

        setActive(server);

        // Store active server in localStorage
        // CallPage can read this later

        localStorage.setItem("activeStun", server);

    };
    useEffect(() => {

        const loadServers = async () => {

            if (!identitiyManager) return;

            let stored = await identityManager.getStunServers();

            if (!stored || stored.length === 0) {

                const defaultServer = "stun:stun.l.google.com:19302";

                await identityManager.addStunServer(defaultServer);

                stored = [defaultServer];
            }

            setServers(stored);
            setActive(stored[0]);

        };

        loadServers();

    }, [identitiyManager]);

    return (
        <div>

            {/* Add server */}

            <h2 className="font-semibold mb-3 text-sm sm:text-base">
                Add STUN Server (A default STUN Server is provided)
            </h2>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">

                <input
                    type="text"
                    placeholder="stun:example.com:3478"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 border rounded px-3 py-2 text-sm"
                />

                <button
                    onClick={addServer}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                >
                    Add
                </button>

            </div>

            {/* Server list */}

            <h2 className="font-semibold mb-3 text-sm sm:text-base">
                Saved Servers
            </h2>

            <div className="space-y-3">

                {servers.map((server) => (

                    <div
                        key={server}
                        className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >

                        <div className="text-sm break-all">

                            {server}

                            {pingResults[server] && (
                                <div className="text-xs text-gray-500 mt-1">
                                    Ping: {pingResults[server]}
                                </div>
                            )}

                        </div>

                        <div className="flex gap-3 text-sm">

                            <button
                                onClick={() => useServer(server)}
                                className="text-green-600 cursor-pointer"
                            >
                                Use
                            </button>

                            <button
                                onClick={() => pingServer(server)}
                                className="text-blue-600 cursor-pointer"
                            >
                                Ping
                            </button>

                            <button
                                onClick={() => deleteServer(server)}
                                className="text-red-500 cursor-pointer"
                            >
                                Delete
                            </button>

                        </div>

                    </div>

                ))}

            </div>

            {/* Active */}

            <div className="mt-6 p-3 bg-green-50 border rounded text-sm break-all">

                <span className="font-medium">
                    Active STUN Server
                </span>

                <div className="mt-1">
                    {active}
                </div>

            </div>

        </div>
    );
}
