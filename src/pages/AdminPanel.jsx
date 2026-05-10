import { useEffect, useState } from "react";

export default function AdminPanel() {
  const [token, setToken] = useState(null);
  const [requests, setRequests] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [serverUrl, setServerUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const baseUrl = serverUrl?.replace(/\/$/, "");

  useEffect(() => {
    const savedServer = localStorage.getItem("signalling_server_url");
    const savedToken = localStorage.getItem("admin_token");
    const savedKey = localStorage.getItem("admin_public_key");

    if (savedServer) setServerUrl(savedServer);
    if (savedToken) setToken(savedToken);
    if (savedKey) setPublicKey(savedKey);
  }, []);

  useEffect(() => {
    if (serverUrl) localStorage.setItem("signalling_server_url", serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (token) localStorage.setItem("admin_token", token);
  }, [token]);

  useEffect(() => {
    if (publicKey) localStorage.setItem("admin_public_key", publicKey);
  }, [publicKey]);

  async function safeParse(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function safeText(val) {
    if (typeof val === "string") return val;
    if (val === null || val === undefined) return "";
    return JSON.stringify(val);
  }

  function normalizeRequest(data) {
    if (!Array.isArray(data)) return [];

    return data.map((r, i) => ({
      publicKey: safeText(r?.publicKey || r?.user || `unknown-${i}`),
      message: safeText(r?.message),
    }));
  }

  function normalizeApproved(data) {
    if (!Array.isArray(data)) return [];

    return data.map((u, i) => {
      if (typeof u === "string") {
        return { publicKey: u };
      }

      return {
        publicKey: safeText(u?.publicKey || u?.user || `unknown-${i}`),
      };
    });
  }

  function handleAuthFail() {
    setToken(null);
    localStorage.removeItem("admin_token");
    setError("Session expired. Please login again.");
  }

  async function fetchData() {
    try {
      if (!baseUrl) throw new Error("Server URL not set");
      if (!token) throw new Error("Not logged in");

      setLoading(true);
      setError("");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [reqRes, appRes] = await Promise.all([
        fetch(`${baseUrl}/admin/requests`, { headers }),
        fetch(`${baseUrl}/admin/approved`, { headers }),
      ]);

      const reqData = await safeParse(reqRes);
      const appData = await safeParse(appRes);

      if (reqRes.status === 403 || appRes.status === 403) {
        handleAuthFail();
        return;
      }

      if (!reqRes.ok) throw new Error("Failed to load requests");
      if (!appRes.ok) throw new Error("Failed to load approved users");

      setRequests(normalizeRequest(reqData));
      setApproved(normalizeApproved(appData));

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function authFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (res.status === 403) {
      handleAuthFail();
      return null;
    }

    return res;
  }

  async function approve(pk) {
    await authFetch(`${baseUrl}/admin/approve`, {
      method: "POST",
      body: JSON.stringify({ publicKey: pk }),
    });

    fetchData();
  }

  async function reject(pk) {
    await authFetch(`${baseUrl}/admin/reject`, {
      method: "POST",
      body: JSON.stringify({ publicKey: pk }),
    });

    fetchData();
  }

  async function removeUser(pk) {
    await authFetch(`${baseUrl}/admin/remove`, {
      method: "POST",
      body: JSON.stringify({ publicKey: pk }),
    });

    fetchData();
  }

  async function loginAsAdmin() {
    try {
      if (!baseUrl) throw new Error("Server URL not set");

      const password = prompt("Enter admin password:");

      const res = await fetch(`${baseUrl}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Login failed");

      setToken(data.token);
      setError("");

    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 px-3 py-4 text-sm">
      <div className="max-w-md mx-auto space-y-4">

        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          <h2 className="text-base font-semibold">Admin Panel</h2>

          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="Server URL"
            className="w-full border p-2 rounded"
          />

          <input
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="Admin Public Key"
            className="w-full border p-2 rounded"
          />

          {!token ? (
            <button
              onClick={loginAsAdmin}
              disabled={!serverUrl || !publicKey}
              className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
            >
              Login as Admin
            </button>
          ) : (
            <button
              onClick={fetchData}
              className="w-full bg-green-600 text-white py-2 rounded"
            >
              Refresh
            </button>
          )}

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>

        {token && (
          <>
            <div className="bg-white p-3 rounded-lg shadow">
              <h3 className="font-medium mb-2">Pending Requests</h3>
              {loading && <p>Loading...</p>}

              {requests.map((r, i) => (
                <div key={r.publicKey || `req-${i}`} className="border rounded p-2 mb-2">
                  <p className="break-words"><b>User:</b> {safeText(r.publicKey)}</p>
                  <p className="break-words text-gray-600"><b>Message:</b> {safeText(r.message)}</p>

                  <div className="flex gap-2 mt-2">
                    <button onClick={() => approve(r.publicKey)} className="flex-1 bg-green-500 text-white py-1 rounded">Approve</button>
                    <button onClick={() => reject(r.publicKey)} className="flex-1 bg-red-500 text-white py-1 rounded">Reject</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-3 rounded-lg shadow">
              <h3 className="font-medium mb-2">Approved Users</h3>

              {approved.map((u, i) => (
                <div key={u.publicKey || `app-${i}`} className="border rounded p-2 mb-2">
                  <p className="break-words">{safeText(u.publicKey)}</p>
                  <button onClick={() => removeUser(u.publicKey)} className="w-full bg-red-500 text-white py-1 rounded mt-2">Remove</button>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
