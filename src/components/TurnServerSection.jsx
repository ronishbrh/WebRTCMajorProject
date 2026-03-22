import { useState, useEffect } from "react";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";
import { getMeterredTurnServers } from "../utils/meterredTurnServer";
import { FiTrash2, FiRefreshCw, FiCheck } from "react-icons/fi";

const identityManager = new IdentityManager();

export default function TurnServerSection() {
  const { identity } = useUser();
  
  const [servers, setServers] = useState([]);
  
  const [meterredServers, setMeterredServers] = useState([]);

  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
 
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // "success" or "error"
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!identity) return;

    const loadServers = async () => {
      try {
        const turnServers = await identityManager.getTurnServers(identity.userName);
        setServers(turnServers || []);
        console.log("Loaded manual TURN servers:", turnServers);
      } catch (err) {
        console.error("X Failed to load TURN servers:", err);
      }
    };

    loadServers();
  }, [identity]);

  //Metered servers on mount
  useEffect(() => {
    fetchMeterredServers();
  }, []);


  const fetchMeterredServers = async () => {
    setLoading(true);
    try {
      const meterredData = await getMeterredTurnServers();
      setMeterredServers(meterredData);

      if (meterredData && meterredData.length > 0) {
        setMessage(`✅ Got ${meterredData.length} TURN server(s) from Metered`);
        setMessageType("success");
      } else {
        setMessage("⚠️ No TURN servers from Metered (check API key in meterredTurnServer.js)");
        setMessageType("error");
      }

      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      console.error("Failed to fetch Metered servers:", err);
      setMessage("Failed to fetch from Metered: " + err.message);
      setMessageType("error");
      setTimeout(() => setMessage(""), 4000);
    } finally {
      setLoading(false);
    }
  };

  //manual server
  const addServer = async () => {
    if (!url.trim()) {
      setMessage("X Please enter a server URL");
      setMessageType("error");
      return;
    }

    try {
      const serverObj = {
        url: url.trim(),
        username: username.trim() || "",
        password: password.trim() || "",
        timestamp: new Date().toISOString(),
        source: "manual"
      };

      await identityManager.addTurnServer(identity.userName, serverObj);
      
      // Update local state
      setServers([...servers, serverObj]);

      setUrl("");
      setUsername("");
      setPassword("");

      setMessage("TURN server added successfully");
      setMessageType("success");
      setTimeout(() => setMessage(""), 3000);

      console.log("Manual TURN server added:", serverObj);
    } catch (err) {
      console.error("Failed to add TURN server:", err);
      setMessage("Failed to add TURN server: " + err.message);
      setMessageType("error");
    }
  };

  // Delete manual server
  const deleteServer = async (serverUrl) => {
    try {
      await identityManager.deleteTurnServer(identity.userName, serverUrl);
      setServers(servers.filter(s => s.url !== serverUrl));

      setMessage("TURN server deleted");
      setMessageType("success");
      setTimeout(() => setMessage(""), 2000);

      console.log("TURN server deleted:", serverUrl);
    } catch (err) {
      console.error("Failed to delete TURN server:", err);
      setMessage("Failed to delete: " + err.message);
      setMessageType("error");
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">TURN Servers</h2>
      <p className="text-sm text-gray-600 mb-6">
        Relay servers used when direct P2P connection fails
      </p>

      {/* METERED SECTION */}
      <div className="mb-8 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          
          <button
            onClick={fetchMeterredServers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 font-medium"
          >
            <FiRefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Metered Servers Display */}
        {meterredServers && meterredServers.length > 0 ? (
          <div className="space-y-2">
            {meterredServers.map((server, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border-2 border-green-200 shadow-sm">
                <div className="flex items-start gap-3">
                  <FiCheck className="text-green-600 flex-shrink-0 mt-1" size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-gray-900 break-all">
                      {server.url}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      👤 {server.username || "auto-auth"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-4 rounded-lg border border-blue-200 text-center">
            <p className="text-sm text-gray-600">
              No servers loaded yet
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Click "Refresh" to fetch free TURN servers
            </p>
          </div>
        )}
      </div>

      {/* MANUAL SERVER SECTION */}
      <div className="mb-8">
        <h3 className="font-bold text-lg text-gray-800 mb-4">
          Add Manual TURN Server (Optional)
        </h3>

        <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Server URL *
            </label>
            <input
              type="text"
              placeholder="turn:example.com:3478"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
            <p className="text-xs text-gray-500 mt-1">Format: turn:hostname:port</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Username (Optional)
            </label>
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password (Optional)
            </label>
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          <button
            onClick={addServer}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-semibold"
          >
            Add Manual TURN Server
          </button>
        </div>
      </div>

      {/* MESSAGE FEEDBACK */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg text-sm font-medium transition ${
            messageType === "success"
              ? "bg-green-50 text-green-800 border-2 border-green-200"
              : "bg-red-50 text-red-800 border-2 border-red-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* DISPLAY MANUAL SERVERS */}
      {servers && servers.length > 0 && (
        <div className="mt-8">
          <h3 className="font-bold text-lg text-gray-800 mb-4">
            Your Manual Servers ({servers.length})
          </h3>

          <div className="space-y-3">
            {servers.map((server) => (
              <div
                key={server.url}
                className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-gray-900 break-all font-semibold">
                      {server.url}
                    </p>
                    {server.username && (
                      <p className="text-xs text-gray-600 mt-2">
                        👤 {server.username}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Added: {new Date(server.timestamp).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    onClick={() => deleteServer(server.url)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 transition flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-semibold whitespace-nowrap"
                  >
                    <FiTrash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}