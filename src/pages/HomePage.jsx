import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import SignalingServerSection from "../components/SignalingServerSection";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

// ── URL helpers ──────────────────────────────────────────────────────────────
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

// ── Export CryptoKey → base64 string ────────────────────────────────────────
async function exportPublicKey(cryptoKey) {
  const spki = await crypto.subtle.exportKey("spki", cryptoKey);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}

export default function HomePage() {
  const navigate = useNavigate();
  const { identity } = useUser();

  const [contacts, setContacts] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [signalingServer, setSignalingServer] = useState(null);
  const [serverCheckStatus, setServerCheckStatus] = useState({});

  const [selectedServer, setSelectedServer] = useState(
    localStorage.getItem("selectedSignalingServer") || null
  );

  const wsRef = useRef(null);
  const registeredRef = useRef(false);
  const contactsRef = useRef([]);

  useEffect(() => {
    if (selectedServer) {
      localStorage.setItem("selectedSignalingServer", selectedServer);
    }
  }, [selectedServer]);

  /* LOAD SIGNALING SERVER -------------------------------------------------- */
  useEffect(() => {
    if (!identity) {
      navigate("/login");
      return;
    }

    const loadServer = async () => {
      const server = await identityManager.getActiveSignallingServer(identity.userName);
      const finalServer = toWss(server || "wss://webrtc-signaling-server-up3e.onrender.com");
      console.log("Using active signaling server:", finalServer);
      setSignalingServer(finalServer);
    };

    loadServer();
  }, [identity, navigate]);

  /* LOAD CONTACTS ---------------------------------------------------------- */
  useEffect(() => {
    if (!identity) return;

    const loadContacts = async () => {
      const list = await identityManager.getContacts(identity.userName);
      setContacts(list);
      contactsRef.current = list;
      console.log("Loaded contacts:", list);
    };

    loadContacts();
  }, [identity]);

  /* CHECK SERVER CONNECTIVITY ---------------------------------------------- */
  const checkServerConnectivity = async (serverURL) => {
    return new Promise((resolve) => {
      if (!serverURL) { resolve(false); return; }
      const wssURL = toWss(serverURL);
      const timeout = setTimeout(() => resolve(false), 3000);
      try {
        const ws = new WebSocket(wssURL);
        ws.onopen  = () => { clearTimeout(timeout); ws.close(); resolve(true); };
        ws.onerror = () => { clearTimeout(timeout); resolve(false); };
        ws.onclose = () => { clearTimeout(timeout); };
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  };

  /* WEBSOCKET CONNECTION --------------------------------------------------- */
  useEffect(() => {
    if (!identity || !signalingServer) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    console.log("Connecting to signaling server:", signalingServer);
    registeredRef.current = false;

    const ws = new WebSocket(toWss(signalingServer));

    ws.onopen = async () => {
      if (registeredRef.current) return;

      const serverKey = toHttp(signalingServer);
      const token = localStorage.getItem(`token_${serverKey}`);

      if (!token) {
        console.warn("No token for server, cannot register:", signalingServer);
        ws.close();
        return;
      }

      // identity.publicKey is a CryptoKey object — must export to base64
      let publicKeyBase64;
      try {
        publicKeyBase64 = await exportPublicKey(identity.publicKey);
      } catch (e) {
        console.error("Failed to export public key:", e);
        ws.close();
        return;
      }

      // Verify the exported key matches the token before sending
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        console.log("Token user      :", payload.user);
        console.log("publicKeyBase64 :", publicKeyBase64);
        console.log("Keys match?     :", payload.user === publicKeyBase64);
      } catch (e) {
        console.warn("Could not decode token for debug:", e);
      }

      ws.send(JSON.stringify({
        type: "register",
        userName: identity.userName,
        publicKey: publicKeyBase64,   // ← base64 string, not CryptoKey object
        token,
      }));

      registeredRef.current = true;
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("HomePage received:", data.type);

      if (data.type === "error") {
        console.error("Server error:", data.message || data);
      }

      if (data.type === "call-request") {
        const contact = contactsRef.current.find((c) => c.userName === data.from);
        if (!contact) {
          console.error("Call from unknown contact:", data.from);
          ws.send(JSON.stringify({ type: "call-declined", from: identity.publicKey, to: data.from }));
          return;
        }
        setIncomingCall({ from: data.from, contact });
        console.log("Call request received at", Date.now());
      }

      if (data.type === "call-cancelled") {
        if (incomingCall?.from === data.from) {
          setIncomingCall(null);
          alert(`${data.from} cancelled the call`);
        }
      }

      if (data.type === "call-declined") {
        alert(`${data.from} declined your call.`);
      }

      // ── KEY FIX: caller receives call-accepted on HomePage before CallPage
      // is mounted. Forward it via navigation so CallPage can start handshake.
      if (data.type === "call-accepted") {
        console.log("HomePage received call-accepted from", data.from, "— forwarding to CallPage");
        const contact = contactsRef.current.find((c) => c.userName === data.from);
        if (contact) {
          const serverToUse = toWss(contact.signalingServerURL || signalingServer);
          navigate(`/call/${data.from}`, {
            state: {
              contact,
              callInitiated: true,
              callAlreadyAccepted: true,   // ← tells CallPage to skip waiting
              signalingServer: serverToUse,
            },
          });
        }
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
    ws.onclose = () => {
      console.log("WebSocket disconnected");
      registeredRef.current = false;
    };

    wsRef.current = ws;

    return () => { console.log("HomePage unmounted"); };
  }, [identity, signalingServer, incomingCall]);

  /* CALL HANDLER ----------------------------------------------------------- */
  const handleCall = async (contact, selectedServerFromUI) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Connection not ready. Please wait.");
      return;
    }

    try {
      const serverToUse = toWss(selectedServerFromUI || contact.signalingServerURL || signalingServer);

      if (contact.signalingServerURL) {
        setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "checking" }));
        const isOnline = await checkServerConnectivity(contact.signalingServerURL);

        if (!isOnline) {
          setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "offline" }));
          alert(`⚠️ Server Offline\n\n${contact.userName}'s signaling server is unreachable.\nServer: ${contact.signalingServerURL}`);
          setTimeout(() => setServerCheckStatus(prev => { const s = { ...prev }; delete s[contact.userName]; return s; }), 3000);
          return;
        }

        setServerCheckStatus(prev => ({ ...prev, [contact.userName]: "online" }));
        const wssURL = toWss(contact.signalingServerURL);
        await identityManager.setActiveSignallingServer(identity.userName, wssURL);
        setSignalingServer(wssURL);
      }

      navigate(`/call/${contact.userName}`, {
        state: { contact, callInitiated: true, signalingServer: serverToUse },
      });

      setTimeout(() => setServerCheckStatus(prev => { const s = { ...prev }; delete s[contact.userName]; return s; }), 1000);
    } catch (err) {
      console.error("Error during call:", err);
      alert("Failed to initiate call: " + err.message);
    }
  };

  /* DELETE CONTACT --------------------------------------------------------- */
  const handleDelete = async (contact) => {
    try {
      await identityManager.deleteContact(identity.userName, contact.userName);
      setContacts(prev => prev.filter(c => c.userName !== contact.userName));
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact.");
    }
  };

  /* ACCEPT CALL ------------------------------------------------------------ */
  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      const serverToUse = toWss(incomingCall.contact.signalingServerURL || signalingServer);

      if (incomingCall.contact.signalingServerURL) {
        const isOnline = await checkServerConnectivity(incomingCall.contact.signalingServerURL);

        if (!isOnline) {
          wsRef.current.send(JSON.stringify({ type: "call-declined", from: identity.publicKey, to: incomingCall.from }));
          alert(`⚠️ Server Offline\n\n${incomingCall.from}'s signaling server is unreachable.\nCall has been declined.`);
          setIncomingCall(null);
          return;
        }

        const wssURL = toWss(incomingCall.contact.signalingServerURL);
        await identityManager.setActiveSignallingServer(identity.userName, wssURL);
        setSignalingServer(wssURL);
      }

      navigate(`/call/${incomingCall.from}`, {
        state: { contact: incomingCall.contact, incomingCall: true, signalingServer: serverToUse },
      });

      setIncomingCall(null);
    } catch (err) {
      console.error("Error accepting call:", err);
      alert("Failed to accept call: " + err.message);
    }
  };

  /* REJECT CALL ------------------------------------------------------------ */
  const rejectCall = () => {
    if (!incomingCall) return;
    wsRef.current.send(JSON.stringify({ type: "call-declined", from: identity.publicKey, to: incomingCall.from }));
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
                          <p className="text-green-400 text-lg font-bold">✓ Server Online</p>
                          <p className="text-gray-300 text-xs">Connecting...</p>
                        </div>
                      )}
                      {serverCheckStatus[contact.userName] === "offline" && (
                        <div className="text-center">
                          <p className="text-red-400 text-lg font-bold">✗ Server Offline</p>
                          <p className="text-gray-300 text-xs">Cannot connect</p>
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