/**
 * AdminPanel
 *
 * Authenticates using the same ECDSA challenge-response as regular users.
 * The admin identity comes from the app's IdentityManager — no password needed.
 * The server grants role:"admin" because the JWT is signed for the ADMIN_KEY.
 */

import { useEffect, useRef, useState } from "react";
import { useUser } from "../utils/UserContext";
import  { AuthClient } from "../utils/AuthClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHttp(url) {
	if (!url) return url;
	if (url.startsWith("wss://")) return url.replace("wss://", "https://");
	if (url.startsWith("ws://")) return url.replace("ws://", "http://");
	return url;
}

function truncate(key, n = 24) {
  if (!key || key.length <= n) return key;
  return `${key.slice(0, n)}…`;
}

function safeText(v) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return JSON.stringify(v);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { identityManager } = useUser();

  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem("admin_server_url") || ""
  );
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [requests, setRequests] = useState([]);
  const [approved, setApproved] = useState([]);

  const authClientRef = useRef(null);

  // Persist server URL
  useEffect(() => {
    localStorage.setItem("admin_server_url", serverUrl);
  }, [serverUrl]);

  // ── Auth ────────────────────────────────────────────────────────────────────

  async function login() {
    if (!serverUrl.trim()) return setErrorMsg("Enter a server URL first.");
    if (!identityManager?.getUserName()) return setErrorMsg("No identity loaded.");

    setStatus("loading");
    setErrorMsg("");

    try {
      const client = new AuthClient(serverUrl.trim(), identityManager);
      const result = await client.authenticate();

      if (!result) {
        setErrorMsg("Your key is not approved as admin on this server.");
        setStatus("idle");
        return;
      }

      if (!result.isAdmin) {
        setErrorMsg("Authenticated, but your key does not have admin privileges on this server.");
        setStatus("idle");
        return;
      }

      authClientRef.current = client;
      setStatus("ready");
      await loadData(client);
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  async function loadData(client = authClientRef.current) {
    if (!client) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const token = await client.getValidToken();
      const headers = { Authorization: `Bearer ${token}` };
      const httpUrl = toHttp(serverUrl.trim());

      const [reqRes, appRes] = await Promise.all([
        fetch(`${httpUrl}/admin/requests`, { headers }),
        fetch(`${httpUrl}/admin/approved`, { headers }),
      ]);

      if (reqRes.status === 403 || appRes.status === 403) {
        setErrorMsg("Session expired or insufficient privileges.");
        setStatus("idle");
        authClientRef.current = null;
        return;
      }

      const reqData = await reqRes.json();
      const appData = await appRes.json();

      setRequests(
        Array.isArray(reqData)
          ? reqData.map(r => ({
              publicKey: safeText(r?.publicKey),
              message: safeText(r?.message),
              time: r?.time,
            }))
          : []
      );
      setApproved(
        Array.isArray(appData) ? appData : []
      );
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  // ── Admin actions ────────────────────────────────────────────────────────────

  async function adminPost(path, publicKey) {
    const token = await authClientRef.current.getValidToken();
    const httpUrl = toHttp(serverUrl.trim());
    const res = await fetch(`${httpUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ publicKey }),
    });
    if (res.status === 403) {
      setErrorMsg("Session expired.");
      setStatus("idle");
      authClientRef.current = null;
      return false;
    }
    if (!res.ok) { setErrorMsg(await res.text()); return false; }
    return true;
  }

  async function approve(pk) {
    if (await adminPost("/admin/approve", pk)) loadData();
  }

  async function reject(pk) {
    if (await adminPost("/admin/reject", pk)) loadData();
  }

  async function removeUser(pk) {
    if (!confirm(`Remove user?\n\n${pk}`)) return;
    if (await adminPost("/admin/remove", pk)) loadData();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isLoggedIn = status === "ready" || (status === "loading" && authClientRef.current);

  return (
    <div className="min-h-screen bg-gray-50 px-3 py-6 text-sm font-sans">
      <div className="max-w-lg mx-auto space-y-4">

        {/* ── Connection card ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Admin Panel</h2>
            {status === "ready" && (
              <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                Connected
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Server URL</label>
            <input
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder="wss://signal.example.com"
              disabled={isLoggedIn}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your identity</label>
            <p className="text-xs text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 break-all">
              {identityManager?.getPublicKey()
                ? truncate(identityManager.getPublicKey(), 48)
                : "No identity loaded"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Your key must match the <code>ADMIN_KEY</code> on the server.
            </p>
          </div>

          {!isLoggedIn ? (
            <button
              onClick={login}
              disabled={!serverUrl.trim() || status === "loading"}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg transition text-sm"
            >
              {status === "loading" ? "Authenticating…" : "Authenticate as Admin"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => loadData()}
                disabled={status === "loading"}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 rounded-lg transition text-sm"
              >
                {status === "loading" ? "Refreshing…" : "Refresh"}
              </button>
              <button
                onClick={() => { authClientRef.current = null; setStatus("idle"); setRequests([]); setApproved([]); }}
                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
              >
                Disconnect
              </button>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}
        </div>

        {/* ── Pending requests ──────────────────────────────────────────────── */}
        {isLoggedIn && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Pending Requests
              {requests.length > 0 && (
                <span className="ml-2 text-xs font-bold text-white bg-amber-500 rounded-full px-2 py-0.5">
                  {requests.length}
                </span>
              )}
            </h3>

            {requests.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r, i) => (
                  <div key={r.publicKey || i} className="border border-gray-200 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-mono break-all text-gray-700">{r.publicKey}</p>
                    {r.message && (
                      <p className="text-xs text-gray-500 italic">"{r.message}"</p>
                    )}
                    {r.time && (
                      <p className="text-xs text-gray-400">
                        {new Date(r.time).toLocaleString()}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => approve(r.publicKey)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-1.5 rounded-lg transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reject(r.publicKey)}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-1.5 rounded-lg transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Approved users ────────────────────────────────────────────────── */}
        {isLoggedIn && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              Approved Users
              <span className="ml-2 text-xs font-medium text-gray-400">({approved.length})</span>
            </h3>

            {approved.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No approved users.</p>
            ) : (
              <div className="space-y-2">
                {approved.map((pk, i) => (
                  <div key={pk || i} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono break-all text-gray-700 flex-1">{pk}</p>
                    {pk !== identityManager?.getPublicKey() && (
                      <button
                        onClick={() => removeUser(pk)}
                        className="flex-shrink-0 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded px-2 py-1 transition"
                      >
                        Remove
                      </button>
                    )}
                    {pk === identityManager?.getPublicKey() && (
                      <span className="text-xs text-indigo-600 font-medium">You</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}