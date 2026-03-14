import { useState } from "react";

export default function TurnServerSection() {

  const [servers, setServers] = useState([]);

  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const addServer = () => {

    if (!url) return;

    setServers([
      ...servers,
      { url, username, password }
    ]);

    setUrl("");
    setUsername("");
    setPassword("");
  };

  const deleteServer = (url) => {
    setServers(servers.filter(s => s.url !== url));
  };

  return (
    <div>

      <h2 className="font-semibold mb-3 text-sm sm:text-base">
        Add TURN Server
      </h2>

      <div className="space-y-3 mb-6">

        <input
          type="text"
          placeholder="turn:example.com:3478"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />

        <input
          type="text"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />

        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        />

        <button
          onClick={addServer}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
        >
          Add TURN Server
        </button>

      </div>

      <div className="space-y-3">

        {servers.map((server) => (

          <div
            key={server.url}
            className="border rounded-lg p-3 flex flex-col sm:flex-row sm:justify-between gap-3"
          >

            <div className="text-sm break-all">
              {server.url}
              <div className="text-xs text-gray-500">
                {server.username}
              </div>
            </div>

            <div className="flex gap-3 text-sm">

              <button className="text-green-600">
                Use
              </button>

              <button className="text-blue-600">
                Ping
              </button>

              <button
                onClick={() => deleteServer(server.url)}
                className="text-red-500"
              >
                Delete
              </button>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}