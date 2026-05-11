import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser, SocketManager } from "../utils/UserContext";
import { AuthClient } from "../utils/AuthClient";

// Map key: always https:// — used to look up sockets in the Map
function toHttpKey(url) {
  if (!url) return url;
  return url
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/$/, "");
}

// Actual WebSocket URL: always wss:// or ws://
function toWsUrl(url) {
  if (!url) return url;
  return url
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace(/\/$/, "");
}

export default function HomePage() {
  const navigate = useNavigate();
  const { identityManager, addSocket, getSocket, listSockets, removeSocket } = useUser();

  const [contacts,     setContacts]     = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);

  const incomingCallRef = useRef(null);
  const outgoingCallRef = useRef(null);
  const contactsRef     = useRef([]);
  const callTimeoutRef  = useRef(null);

  // ── Load contacts ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!identityManager) { navigate("/login"); return; }
    const list = identityManager.getContacts();
    setContacts(list);
    contactsRef.current = list;
    console.log("[HomePage] Contacts loaded:", list.length);
  }, [identityManager]);

  // ── Socket setup (one per signalling server, in parallel) ────────────────
  useEffect(() => {
    if (!identityManager) return;

    const servers     = identityManager.getSignallingServers();
    const myPublicKey = identityManager.getPublicKey();
    const unsubscribers = [];
    let cancelled = false;

    // Each server gets its own isolated async scope — no closure leaks across loop
    const setupServer = async (server) => {
      const authClient = new AuthClient(server.url, identityManager);
      let token;

      try {
        token = await authClient.getValidToken();
      } catch (err) {
        console.warn("[HomePage] Auth failed for:", server.url, err.message);
        return;
      }

      if (!token) {
        console.warn("[HomePage] No valid token for:", server.url, "— needs access approval");
        return;
      }

      if (cancelled) return;

      const key   = toHttpKey(server.url);
      const wsUrl = toWsUrl(server.url);

      let sm = getSocket(key);

      if (sm && sm.isOpen()) {
        console.log("[HomePage] Reusing open socket for:", key);
      } else {
        console.log("[HomePage] Opening new WebSocket:", wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("[HomePage] WebSocket open:", wsUrl);
          ws.send(JSON.stringify({ type: "register", publicKey: myPublicKey, token }));
        };
        ws.onerror = (e) => console.error("[HomePage] WebSocket error:", wsUrl, e);
        ws.onclose = (e) => {
          console.log("[HomePage] WebSocket closed:", wsUrl, e.code, e.reason);
          // Auto-reconnect after 5s if not deliberately cancelled (e.g. unmount)
          if (!cancelled) {
            console.log("[HomePage] Scheduling reconnect in 5s for:", wsUrl);
            setTimeout(() => {
              if (!cancelled) setupServer(server);
            }, 5000);
          }
        };

        sm = new SocketManager(ws);
        addSocket(key, sm);
      }

      // ── Keepalive ping — prevents Render.com / idle server from dropping socket ──
      const pingInterval = setInterval(() => {
        if (sm.isOpen()) sm.send({ type: "ping", from: myPublicKey });
      }, 25_000);

      // Register the interval cleanup alongside handler unsubscribers
      unsubscribers.push(() => clearInterval(pingInterval));

      // ── Event handlers — all closures correctly scoped to this server ────────

      unsubscribers.push(sm.subscribe("registered", (data) => {
        console.log("[HomePage] Registered on:", server.url, data.publicKey?.slice(0, 20));
      }));

      unsubscribers.push(sm.subscribe("call-request", (data) => {
        console.log("[HomePage] call-request on", server.url, "from:", data.from?.slice(0, 20));
        const contact = contactsRef.current.find(c => c.publicKey === data.from);

        if (!contact) {
          console.warn("[HomePage] Unknown caller on", server.url, "— declining");
          sm.send({ type: "call-declined", from: myPublicKey, to: data.from });
          return;
        }
        if (incomingCallRef.current) {
          console.warn("[HomePage] Already in a call — declining on", server.url);
          sm.send({ type: "call-declined", from: myPublicKey, to: data.from });
          return;
        }

        // Tag call with which server it arrived on so acceptCall uses the right socket
        const call = { from: data.from, contact, server: server.url };
        setIncomingCall(call);
        incomingCallRef.current = call;
      }));

      unsubscribers.push(sm.subscribe("call-cancelled", (data) => {
        if (incomingCallRef.current?.from === data.from) {
          const name = incomingCallRef.current?.contact?.userName ?? data.from;
          setIncomingCall(null);
          incomingCallRef.current = null;
          alert(`${name} cancelled the call`);
        }
      }));

      unsubscribers.push(sm.subscribe("call-declined", (data) => {
        clearTimeout(callTimeoutRef.current);
        const oc = outgoingCallRef.current;
        setOutgoingCall(null);
        outgoingCallRef.current = null;
        alert(`${oc?.contact?.userName ?? data.from} declined your call.`);
      }));

      unsubscribers.push(sm.subscribe("call-accepted", (data) => {
        clearTimeout(callTimeoutRef.current);
        const oc = outgoingCallRef.current;
        if (!oc) return;
        setOutgoingCall(null);
        outgoingCallRef.current = null;

        navigate(`/call/${oc.contact.userName}`, {
          state: {
            contact:             oc.contact,
            callInitiated:       true,
            callAlreadyAccepted: true,
            signallingServer:    oc.server,
          },
        });
      }));

      unsubscribers.push(sm.subscribe("error", (data) => {
        console.error("[HomePage] Server error on", server.url, ":", data.message);
        // Clear stale token for THIS server only, then remove its socket
        authClient.clearTokens();
        removeSocket(key);
      }));
    };

    // All servers authenticate and connect in parallel
    const setup = async () => {
      await Promise.allSettled(servers.map(server => setupServer(server)));
    };

    setup();

    return () => {
      cancelled = true;
      console.log("[HomePage] Unmounting — removing handlers & pings, keeping sockets alive");
      unsubscribers.forEach(fn => fn());
    };
  }, [identityManager]);

  // ── Make a call ──────────────────────────────────────────────────────────
  const handleCall = (contact) => {
    const rawServer = contact.selectedSignallingServer;
    const socketKey = toHttpKey(rawServer);

    console.log("[handleCall] contact:", contact.userName);
    console.log("[handleCall] server:", rawServer, "| key:", socketKey);
    console.log("[handleCall] stored keys:", listSockets());

    if (!rawServer) {
      alert("Please select a signalling server for this contact first.");
      return;
    }

    const socket = getSocket(socketKey);

    if (!socket || !socket.isOpen()) {
      alert(
        `Not connected to signalling server.\n\n` +
        `Key: "${socketKey}"\n` +
        `Stored keys: ${listSockets().join("\n") || "(none)"}\n` +
        `Socket state: ${socket ? "exists but CLOSED" : "not found"}`
      );
      return;
    }

    const oc = { contact, server: rawServer };
    setOutgoingCall(oc);
    outgoingCallRef.current = oc;

    socket.send({
      type: "call-request",
      from: identityManager.getPublicKey(),
      to:   contact.publicKey,
    });

    callTimeoutRef.current = setTimeout(() => {
      if (!outgoingCallRef.current) return;
      socket.send({
        type: "call-cancelled",
        from: identityManager.getPublicKey(),
        to:   contact.publicKey,
      });
      setOutgoingCall(null);
      outgoingCallRef.current = null;
      alert(`${contact.userName} didn't answer.`);
    }, 30_000);
  };

  // ── Cancel outgoing call ─────────────────────────────────────────────────
  const cancelOutgoing = () => {
    clearTimeout(callTimeoutRef.current);
    const oc = outgoingCallRef.current;
    if (!oc) return;
    getSocket(toHttpKey(oc.server))?.send({
      type: "call-cancelled",
      from: identityManager.getPublicKey(),
      to:   oc.contact.publicKey,
    });
    setOutgoingCall(null);
    outgoingCallRef.current = null;
  };

  // ── Accept incoming call ─────────────────────────────────────────────────
  const acceptCall = () => {
    const call = incomingCallRef.current;
    if (!call) return;

    const socket = getSocket(toHttpKey(call.server));
    if (!socket) { alert("Lost connection to signalling server."); return; }

    socket.send({
      type: "call-accepted",
      from: identityManager.getPublicKey(),
      to:   call.from,
    });

    setIncomingCall(null);
    incomingCallRef.current = null;

    navigate(`/call/${call.contact.userName}`, {
      state: {
        contact:         call.contact,
        incomingCall:    true,
        signallingServer: call.server,
      },
    });
  };

  // ── Reject incoming call ─────────────────────────────────────────────────
  const rejectCall = () => {
    const call = incomingCallRef.current;
    if (!call) return;
    getSocket(toHttpKey(call.server))?.send({
      type: "call-declined",
      from: identityManager.getPublicKey(),
      to:   call.from,
    });
    setIncomingCall(null);
    incomingCallRef.current = null;
  };

  // ── Delete contact ───────────────────────────────────────────────────────
  const handleDelete = async (contact) => {
    try {
      await identityManager.deleteContact(contact.userName);
      setContacts(prev => prev.filter(c => c.userName !== contact.userName));
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact.");
    }
  };

  if (!identityManager) return null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar
        onHomeClick={() => navigate("/")}
        onProfileClick={() => navigate("/profile")}
        onContactClick={() => navigate("/contact")}
        onServerClick={() => navigate("/server")}
      />

      <main className="p-4 sm:p-6 flex-1">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold mb-4">Connections</h2>

          <div className="space-y-3 w-full">
            {contacts.length === 0 ? (
              <p className="text-gray-500">No contacts found.</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.userName} className="relative">
                  <UserCard
                    user={{
                      name:             contact.userName,
                      avatar:           contact.avatar || `https://placehold.co/80x80?text=${contact.userName.charAt(0).toUpperCase()}`,
                      status:           contact.status || "Available",
                      publicKey:        contact.publicKey,
                      signallingServers: contact.signallingServers,
                      contact,
                    }}
                    allContacts={contacts}
                    onClick={() => handleCall(contact)}
                    onCall={() => handleCall(contact)}
                    onDelete={() => handleDelete(contact)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* INCOMING CALL OVERLAY */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
          <h2 className="text-2xl text-white mb-4">
            Incoming call from {incomingCall.contact?.userName ?? incomingCall.from}
          </h2>
          <div className="flex gap-4">
            <button
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={acceptCall}
            >
              Accept
            </button>
            <button
              className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={rejectCall}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* OUTGOING CALL OVERLAY */}
      {outgoingCall && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
          <div className="w-14 h-14 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mb-5" />
          <h2 className="text-2xl text-white mb-2">Calling {outgoingCall.contact.userName}…</h2>
          <p className="text-gray-400 text-sm mb-6">Waiting for them to answer</p>
          <button
            className="px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700"
            onClick={cancelOutgoing}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}