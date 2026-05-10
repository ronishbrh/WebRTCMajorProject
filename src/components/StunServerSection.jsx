import { useState, useEffect } from "react";
import { useUser } from "../utils/UserContext";

export default function StunServerSection() {
  const { identityManager } = useUser();

  const [servers, setServers]       = useState([]);
  const [input, setInput]           = useState("");
  const [active, setActive]         = useState(null);
  const [pingResults, setPingResults] = useState({});

  // ── Load servers on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!identityManager) return;

    const load = async () => {
      let stored = identityManager.getStunServers();

      if (!stored || stored.length === 0) {
        const defaultServer = "stun:stun.l.google.com:19302";
        await identityManager.addStunServer(defaultServer);
        stored = identityManager.getStunServers();
      }

      // Spread into new array so React detects the change
      setServers([...stored]);

      const savedActive = localStorage.getItem("activeStun");
      setActive(savedActive && stored.includes(savedActive) ? savedActive : stored[0]);
    };

    load();
  }, [identityManager]);

  // ── Add ────────────────────────────────────────────────────────────────
  const addServer = async () => {
    if (!input.trim()) return;

    const trimmed = input.trim();
    const current = identityManager.getStunServers();

    if (current.includes(trimmed)) {
      alert("Server already added.");
      return;
    }

    await identityManager.addStunServer(trimmed);
    setServers([...identityManager.getStunServers()]);
    setInput("");
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteServer = async (url) => {
    await identityManager.deleteStunServer(url);
    const updated = [...identityManager.getStunServers()];
    setServers(updated);

    // If deleted the active server, switch to first remaining
    if (active === url) {
      const next = updated[0] ?? null;
      setActive(next);
      if (next) localStorage.setItem("activeStun", next);
      else localStorage.removeItem("activeStun");
    }

    // Clear ping result for deleted server
    setPingResults((prev) => {
      const copy = { ...prev };
      delete copy[url];
      return copy;
    });
  };

  // ── Ping ───────────────────────────────────────────────────────────────
  const pingServer = async (server) => {
    setPingResults((prev) => ({ ...prev, [server]: "checking…" }));

    const start = Date.now();

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: server }] });
      pc.createDataChannel("test");

      let resolved = false;

      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate.includes("srflx")) {
          resolved = true;
          setPingResults((prev) => ({ ...prev, [server]: `${Date.now() - start} ms` }));
          pc.close();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setTimeout(() => {
        if (!resolved) {
          setPingResults((prev) => ({ ...prev, [server]: "failed" }));
          pc.close();
        }
      }, 4000);

    } catch {
      setPingResults((prev) => ({ ...prev, [server]: "failed" }));
    }
  };

  // ── Set active ─────────────────────────────────────────────────────────
  const useServer = (server) => {
    setActive(server);
    localStorage.setItem("activeStun", server);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 className="font-semibold mb-3 text-sm sm:text-base">
        Add STUN Server (a default is provided)
      </h2>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="stun:example.com:3478"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addServer()}
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={addServer}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
        >
          Add
        </button>
      </div>

      <h2 className="font-semibold mb-3 text-sm sm:text-base">Saved Servers</h2>

      <div className="space-y-3">
        {servers.map((server) => (
          <div
            key={server}
            className={`border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              active === server ? "border-green-400 bg-green-50" : ""
            }`}
          >
            <div className="text-sm break-all">
              {server}
              {active === server && (
                <span className="ml-2 text-xs text-green-600 font-medium">● active</span>
              )}
              {pingResults[server] && (
                <div className="text-xs text-gray-500 mt-1">
                  Ping: {pingResults[server]}
                </div>
              )}
            </div>

            <div className="flex gap-3 text-sm">
              <button onClick={() => useServer(server)}   className="text-green-600 cursor-pointer hover:underline">Use</button>
              <button onClick={() => pingServer(server)}  className="text-blue-600 cursor-pointer hover:underline">Ping</button>
              <button onClick={() => deleteServer(server)} className="text-red-500 cursor-pointer hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-green-50 border rounded text-sm break-all">
        <span className="font-medium">Active STUN Server</span>
        <div className="mt-1">{active ?? "None selected"}</div>
      </div>
    </div>
  );
}