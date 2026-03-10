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
  const wsRef = useRef(null);
  const registeredRef = useRef(false);
  const contactsRef = useRef([]);

  useEffect(() => {
    if (!identity) {
      navigate("/login");
      return;
    }

    const loadContacts = async () => {
      const list = await identityManager.getContacts(identity.userName);
      setContacts(list);
      contactsRef.current = list; 
      console.log("Loaded contacts:", list);
    };
    loadContacts();

    // Only create WebSocket if we dont have
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    registeredRef.current = false;
    const ws = new WebSocket("wss://localhost:8080");
    // const ws = new WebSocket("wss://192.168.1.239:8080");

    ws.onopen = () => {
      if (!registeredRef.current) {
        ws.send(JSON.stringify({ type: "register", userName: identity.userName }));
        registeredRef.current = true;
        console.log("WebSocket connected and registered on HomePage");
      }
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log("HomePage received:", data.type);

      // Incoming call request
      if (data.type === "call-request") {
        const contact = contactsRef.current.find(c => c.userName === data.from);
        if (!contact) {
          console.error("Received call from unknown contact:", data.from);
          alert(`Call from ${data.from} but they're not in your contacts! Please add them first.`);
          // Send rejection
          ws.send(JSON.stringify({
            type: "call-declined",
            from: identity.userName,
            to: data.from,
          }));
          return;
        }
        console.log("Incoming call from contact:", contact);
        setIncomingCall({ from: data.from, contact });
      }

      // Call cancelled by caller
      if (data.type === "call-cancelled") {
        if (incomingCall?.from === data.from) {
          setIncomingCall(null);
          alert(`${data.from} cancelled the call`);
        }
      }

      // Call declined by callee 
      if (data.type === "call-declined") {
        alert(`${data.from} declined your call.`);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error on HomePage:", err);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [identity, navigate]); 

  //---------------Caller ko lagi--------------------------
  const handleCall = async (contact) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Connection not ready. Please wait.");
      return;
    }

    // Navigate to call page as caller
    navigate(`/call/${contact.userName}`, {
      state: {
        contact,
        callInitiated: true, 
      },
    });
  };

  // Delete a contact
  const handleDelete = async (contact) => {
    try {
      await identityManager.deleteContact(identity.userName, contact.userName);
      setContacts((prev) => prev.filter((c) => c.userName !== contact.userName));
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact. Try again.");
    }
  };


  //---------------Callee ko lagi------------------------------
  const acceptCall = async () => {
    if (!incomingCall) return;

    // Navigate to call page as callee
    navigate(`/call/${incomingCall.from}`, {
      state: {
        contact: incomingCall.contact,
        incomingCall: true, // This marks us as the callee who accepted
      },
    });
    
    setIncomingCall(null);
  };

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
//-------------------------------------------------------------------

  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar
        onHomeClick={() => navigate("/")}
        onProfileClick={() => navigate("/profile")}
        onContactClick={() => navigate("/contact")}
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

      {/* INCOMING CALL OVERLAY */}
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