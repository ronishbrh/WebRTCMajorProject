import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

function toWss(url) {
  if (!url) return url;
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://"))  return url.replace("http://",  "ws://");
  return url;
}

function toHttp(url) {
  if (!url) return url;
  if (url.startsWith("wss://")) return url.replace("wss://", "https://");
  if (url.startsWith("ws://"))  return url.replace("ws://",  "http://");
  return url;
}

async function exportPublicKey(cryptoKey) {
  const spki = await crypto.subtle.exportKey("spki", cryptoKey);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}

export default function HomePage() {
  const navigate = useNavigate();
  const { identity } = useUser();

  const [contacts, setContacts] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null); // { contact, server }
  const [signalingServer, setSignalingServer] = useState(null);
  const [serverCheckStatus, setServerCheckStatus] = useState({});
  const [selectedServer, setSelectedServer] = useState(
    localStorage.getItem("selectedSignalingServer") || null
  );

  const wsRef = useRef(null);
  const registeredRef = useRef(false);
  const contactsRef = useRef([]);
  const outgoingCallRef = useRef(null); // mirror of outgoingCall for use inside ws callbacks
  const callTimeoutRef = useRef(null);

  useEffect(() => {
    if (selectedServer) localStorage.setItem("selectedSignalingServer", selectedServer);
  }, [selectedServer]);

  /* LOAD SIGNALING SERVER -------------------------------------------------- */
  useEffect(() => {
    if (!identity) { navigate("/login"); return; }

    const load = async () => {
      const server = await identityManager.getActiveSignallingServer(identity.userName);
      setSignalingServer(toWss(server || "wss://webrtc-signaling-server-up3e.onrender.com"));
    };
    load();
  }, [identity, navigate]);

  /* LOAD CONTACTS ---------------------------------------------------------- */
  useEffect(() => {
    if (!identity) return;
    const load = async () => {
      const list = await identityManager.getContacts(identity.userName);
      setContacts(list);
      contactsRef.current = list;
    };
    load();
  }, [identity]);

  /* CHECK SERVER CONNECTIVITY ---------------------------------------------- */
  const checkServerConnectivity = (serverURL) =>
    new Promise((resolve) => {
      if (!serverURL) return resolve(false);
      const url = toWss(serverURL);
      const t = setTimeout(() => resolve(false), 3000);
      try {
        const ws = new WebSocket(url);
        ws.onopen  = () => { clearTimeout(t); ws.close(); resolve(true); };
        ws.onerror = () => { clearTimeout(t); resolve(false); };
      } catch { clearTimeout(t); resolve(false); }
    });

  /* WEBSOCKET ---------------------------------------------------------------- */
  useEffect(() => {
    if (!identity || !signalingServer) return;

    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    registeredRef.current = false;

    const ws = new WebSocket(toWss(signalingServer));

    ws.onopen = async () => {
      if (registeredRef.current) return;
      const token = localStorage.getItem(`token_${toHttp(signalingServer)}`);
      if (!token) { console.warn("No token for server"); ws.close(); return; }

      let publicKeyBase64 = "";
      try { publicKeyBase64 = await exportPublicKey(identity.publicKey); } catch {}

      // Debug
      try {
        const p = JSON.parse(atob(token.split(".")[1]));
        console.log("Token user      :", p.user);
        console.log("publicKeyBase64 :", publicKeyBase64);
        console.log("Keys match?     :", p.user === publicKeyBase64);
      } catch {}

      ws.send(JSON.stringify({
        type: "register",
        userName: identity.userName,
        publicKey: publicKeyBase64,
        token,
      }));
      registeredRef.current = true;
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("HomePage received:", data.type);

      if (data.type === "error") {
        console.error("Server error:", data.message);
      }

      /* ── Incoming call ── */
      if (data.type === "call-request") {
        const contact = contactsRef.current.find(c => c.userName === data.from);
        if (!contact) {
          ws.send(JSON.stringify({ type: "call-declined", from: identity.userName, to: data.from }));
          return;
        }
        setIncomingCall({ from: data.from, contact });
      }

      /* ── Caller cancelled before we answered ── */
      if (data.type === "call-cancelled") {
        setIncomingCall(prev => prev?.from === data.from ? null : prev);
        // If we're the callee and still on HomePage, just clear
      }

      /* ── Callee declined our outgoing call ── */
      if (data.type === "call-declined") {
        clearTimeout(callTimeoutRef.current);
        setOutgoingCall(null);
        outgoingCallRef.current = null;
        alert(`${data.from} declined your call.`);
      }

      /* ── Callee accepted our outgoing call ──
           Both sides navigate NOW — caller with callAlreadyAccepted=true
           so CallPage knows to initiate the handshake immediately.        */
      if (data.type === "call-accepted") {
        console.log("HomePage: call-accepted received, navigating caller to CallPage");
        clearTimeout(callTimeoutRef.current);
        const oc = outgoingCallRef.current;
        if (!oc) return;
        setOutgoingCall(null);
        outgoingCallRef.current = null;
        navigate(`/call/${oc.contact.userName}`, {
          state: {
            contact: oc.contact,
            callInitiated: true,
            callAlreadyAccepted: true,   // ← callee already accepted; start handshake right away
            signalingServer: oc.server,
          },
        });
      }
    };

    ws.onerror = err => console.error("WS error:", err);
    ws.onclose = () => { console.log("WebSocket disconnected"); registeredRef.current = false; };

    wsRef.current = ws;
    return () => { /* don't close here — we need ws alive until navigation */ };
  }, [identity, signalingServer]);

  /* INITIATE CALL ---------------------------------------------------------- */
  const handleCall = async (contact, selectedServerFromUI) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Connection not ready. Please wait."); return;
    }

    const serverToUse = toWss(selectedServerFromUI || contact.signalingServerURL || signalingServer);

    if (contact.signalingServerURL) {
      setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "checking" }));
      const online = await checkServerConnectivity(contact.signalingServerURL);
      if (!online) {
        setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "offline" }));
        alert(`⚠️ ${contact.userName}'s server is offline.\n${contact.signalingServerURL}`);
        setTimeout(() => setServerCheckStatus(prev => { const s={...prev}; delete s[contact.userName]; return s; }), 3000);
        return;
      }
      setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "online" }));
    }

    // ── Stay on HomePage, send call-request, wait for call-accepted ──
    const oc = { contact, server: serverToUse };
    setOutgoingCall(oc);
    outgoingCallRef.current = oc;

    wsRef.current.send(JSON.stringify({
      type: "call-request",
      from: identity.userName,
      to: contact.userName,
    }));

    // Timeout if no answer
    callTimeoutRef.current = setTimeout(() => {
      if (outgoingCallRef.current) {
        wsRef.current?.send(JSON.stringify({ type: "call-cancelled", from: identity.userName, to: contact.userName }));
        setOutgoingCall(null);
        outgoingCallRef.current = null;
        alert(`${contact.userName} didn't answer.`);
      }
    }, 30000);
  };

  /* CANCEL OUTGOING CALL --------------------------------------------------- */
  const cancelOutgoing = () => {
    clearTimeout(callTimeoutRef.current);
    const oc = outgoingCallRef.current;
    if (oc && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "call-cancelled", from: identity.userName, to: oc.contact.userName }));
    }
    setOutgoingCall(null);
    outgoingCallRef.current = null;
  };

  /* DELETE CONTACT --------------------------------------------------------- */
  const handleDelete = async (contact) => {
    try {
      await identityManager.deleteContact(identity.userName, contact.userName);
      setContacts(prev => prev.filter(c => c.userName !== contact.userName));
    } catch { alert("Failed to delete contact."); }
  };

  /* ACCEPT INCOMING CALL --------------------------------------------------- */
  const acceptCall = async () => {
    if (!incomingCall) return;
    const serverToUse = toWss(incomingCall.contact.signalingServerURL || signalingServer);

    if (incomingCall.contact.signalingServerURL) {
      const online = await checkServerConnectivity(incomingCall.contact.signalingServerURL);
      if (!online) {
        wsRef.current.send(JSON.stringify({ type: "call-declined", from: identity.userName, to: incomingCall.from }));
        alert(`Server offline. Call declined.`);
        setIncomingCall(null);
        return;
      }
    }

    // Send call-accepted FIRST, then navigate
    wsRef.current.send(JSON.stringify({
      type: "call-accepted",
      from: identity.userName,
      to: incomingCall.from,
    }));

    const contact = incomingCall.contact;
    setIncomingCall(null);

    navigate(`/call/${contact.userName}`, {
      state: {
        contact,
        incomingCall: true,   // callee side — wait for join from caller
        signalingServer: serverToUse,
      },
    });
  };

  /* REJECT INCOMING CALL --------------------------------------------------- */
  const rejectCall = () => {
    if (!incomingCall) return;
    wsRef.current.send(JSON.stringify({ type: "call-declined", from: identity.userName, to: incomingCall.from }));
    setIncomingCall(null);
  };

  /* UI --------------------------------------------------------------------- */
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
                      name: contact.userName,
                      avatar: contact.avatar || `https://placehold.co/80x80?text=${contact.userName.charAt(0).toUpperCase()}`,
                      status: contact.status || "Available",
                      publicKey: contact.publicKey,
                      signalingServers: contact.signalingServers || [],
                    }}
                    allContacts={contacts}
                    onClick={() => handleCall(contact)}
                    onCall={() => handleCall(contact, selectedServer)}
                    onDelete={() => handleDelete(contact)}
                    selectedServer={selectedServer}
                    onSelectServer={setSelectedServer}
                  />
                  {contact.signalingServerURL && serverCheckStatus[contact.userName] && (
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm z-40">
                      {serverCheckStatus[contact.userName] === "checking" && (
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                          <p className="text-white text-sm font-medium">Checking server...</p>
                        </div>
                      )}
                      {serverCheckStatus[contact.userName] === "online" && (
                        <div className="text-center">
                          <p className="text-green-400 text-lg font-bold">✓ Online</p>
                          <p className="text-gray-300 text-xs">Connecting...</p>
                        </div>
                      )}
                      {serverCheckStatus[contact.userName] === "offline" && (
                        <div className="text-center">
                          <p className="text-red-400 text-lg font-bold">✗ Offline</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

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

      {/* INCOMING CALL OVERLAY */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
          <h2 className="text-2xl text-white mb-4">Incoming call from {incomingCall.from}</h2>
          <div className="flex gap-4">
            <button className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700" onClick={acceptCall}>Accept</button>
            <button className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700" onClick={rejectCall}>Decline</button>
          </div>
        </div>
      )}
    </div>
  );
}