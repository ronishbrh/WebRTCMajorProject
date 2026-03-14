import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

export default function HomePage() {
  const navigate = useNavigate();
  const { identity } = useUser();

  const [contacts, setContacts] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [signalingServer, setSignalingServer] = useState(null);

  const wsRef = useRef(null);
  const registeredRef = useRef(false);
  const contactsRef = useRef([]);

  /* ---------------- LOAD SIGNALING SERVER ---------------- */
  useEffect(() => {
    if (!identity) {
      navigate("/login");
      return;
    }

    const loadServer = async () => {
      const server = await identityManager.getActiveSignallingServer(identity.userName);

      // fallback to Render server if none stored
      const finalServer =
        server || "wss://webrtc-signaling-server-up3e.onrender.com";

      console.log("Using signaling server:", finalServer);
      setSignalingServer(finalServer);
    };

    loadServer();
  }, [identity, navigate]);

  /* ---------------- LOAD CONTACTS ---------------- */
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

  /* ---------------- WEBSOCKET CONNECTION ---------------- */
  useEffect(() => {
    if (!identity || !signalingServer) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    console.log("Connecting to signaling server:", signalingServer);

    registeredRef.current = false;
    const ws = new WebSocket(signalingServer);

    ws.onopen = () => {
      console.log("WebSocket connected");

      if (!registeredRef.current) {
        ws.send(
          JSON.stringify({
            type: "register",
            userName: identity.userName,
          })
        );

        registeredRef.current = true;
        console.log("User registered on signaling server");
      }
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("HomePage received:", data.type);

      /* -------- Incoming Call -------- */
      if (data.type === "call-request") {
        const contact = contactsRef.current.find(
          (c) => c.userName === data.from
        );

        if (!contact) {
          console.error("Call from unknown contact:", data.from);

          ws.send(
            JSON.stringify({
              type: "call-declined",
              from: identity.userName,
              to: data.from,
            })
          );

          return;
        }

        setIncomingCall({ from: data.from, contact });
      }

      /* -------- Caller cancelled -------- */
      if (data.type === "call-cancelled") {
        if (incomingCall?.from === data.from) {
          setIncomingCall(null);
          alert(`${data.from} cancelled the call`);
        }
      }

      /* -------- Call declined -------- */
      if (data.type === "call-declined") {
        alert(`${data.from} declined your call.`);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      registeredRef.current = false;
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [identity, signalingServer]);

  /* ---------------- CALL HANDLER ---------------- */
  const handleCall = async (contact) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Connection not ready. Please wait.");
      return;
    }

    navigate(`/call/${contact.userName}`, {
      state: {
        contact,
        callInitiated: true,
      },
    });
  };

  /* ---------------- DELETE CONTACT ---------------- */
  const handleDelete = async (contact) => {
    try {
      await identityManager.deleteContact(
        identity.userName,
        contact.userName
      );

      setContacts((prev) =>
        prev.filter((c) => c.userName !== contact.userName)
      );
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact.");
    }
  };

  /* ---------------- ACCEPT CALL ---------------- */
  const acceptCall = () => {
    if (!incomingCall) return;

    navigate(`/call/${incomingCall.from}`, {
      state: {
        contact: incomingCall.contact,
        incomingCall: true,
      },
    });

    setIncomingCall(null);
  };

  /* ---------------- REJECT CALL ---------------- */
  const rejectCall = () => {
    if (!incomingCall) return;

    wsRef.current.send(
      JSON.stringify({
        type: "call-declined",
        from: identity.userName,
        to: incomingCall.from,
      })
    );

    setIncomingCall(null);
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar
        onHomeClick={() => navigate("/")}
        onProfileClick={() => navigate("/profile")}
        onContactClick={() => navigate("/contact")}
        onServerClick={() => navigate("/server")}
      />

      <main className="p-4 sm:p-6 flex-1">
        <h2 className="text-2xl font-semibold mb-4">Connections</h2>

        <div className="space-y-3 w-full max-w-xl mx-auto mt-2">
          {contacts.length === 0 ? (
            <p className="text-gray-500">No contacts found.</p>
          ) : (
            contacts.map((contact) => (
              <UserCard
                key={contact.userName}
                user={{
                  name: contact.userName,
                  avatar:
                    contact.avatar ||
                    `https://placehold.co/80x80?text=${contact.userName
                      .charAt(0)
                      .toUpperCase()}`,
                }}
                onClick={() => handleCall(contact)}
                onCall={() => handleCall(contact)}
                onDelete={() => handleDelete(contact)}
              />
            ))
          )}
        </div>
      </main>

      {/* INCOMING CALL POPUP */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
          <h2 className="text-2xl text-white mb-4">
            Incoming call from {incomingCall.from}
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
    </div>
  );
}