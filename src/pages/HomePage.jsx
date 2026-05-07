import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import SignalingServerSection from "../components/SignalingServerSection";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

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

  /* LOAD SIGNALING SERVER (active server) ---------------- */
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

      console.log("Using active signaling server:", finalServer);
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

  /* ---------------- CHECK SERVER CONNECTIVITY -------- */
  const checkServerConnectivity = async (serverURL) => {
    return new Promise((resolve) => {
      if (!serverURL) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        console.log(`Server check timeout for ${serverURL}`);
        resolve(false);  // Server is offline
      }, 3000);

      try {
        const ws = new WebSocket(serverURL);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`Server ${serverURL} is ONLINE`);
          ws.close();
          resolve(true);  // Server is online
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          console.log(`Server ${serverURL} is OFFLINE`);
          resolve(false);  // Server is offline
        };

        ws.onclose = () => {
          clearTimeout(timeout);
        };
      } catch (err) {
        clearTimeout(timeout);
        console.error(`Error checking server ${serverURL}:`, err);
        resolve(false);  // Server is offline
      }
    });
  };

  /* ---------------- WEBSOCKET CONNECTION (for incoming calls) ---------------- */
  useEffect(() => {
    if (!identity || !signalingServer) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
        console.log("Call request received at ", Date.now());
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
      console.log("HomePage unmounted");
    };
  }, [identity, signalingServer, incomingCall]);

  /* ---------------- CALL HANDLER - Uses contact's server if available -------- */
  const handleCall = async (contact, selectedServerFromUI) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Connection not ready. Please wait.");
      return;
    }

    console.log("Calling at ", Date.now());

    try {
      const serverToUse =
        selectedServerFromUI ||
        contact.signalingServerURL ||
        signalingServer;

      console.log("Checking server connectivity before calling", contact.userName);

      // Check if contact's server is reachable
      if (contact.signalingServerURL) {
        console.log("Contact has custom server, checking connectivity:", contact.signalingServerURL);

        setServerCheckStatus(prev => ({
          ...prev,
          [contact.userName]: "checking"
        }));

        const isServerOnline = await checkServerConnectivity(contact.signalingServerURL);

        if (!isServerOnline) {
          console.error(`Contact's server is offline: ${contact.signalingServerURL}`);

          setServerCheckStatus(prev => ({
            ...prev,
            [contact.userName]: "offline"
          }));

          // Show alert
          alert(
            `⚠️ Server Offline\n\n` +
            `${contact.userName}'s signaling server is unreachable.\n\n` +
            `Server: ${contact.signalingServerURL}\n\n` +
            `Please try again later or contact ${contact.userName} to check their server status.`
          );

          setTimeout(() => {
            setServerCheckStatus(prev => {
              const newStatus = { ...prev };
              delete newStatus[contact.userName];
              return newStatus;
            });
          }, 3000);

          return;  // Stop call attempt
        }

        console.log("Contact's server is ONLINE, proceeding with call");
        setServerCheckStatus(prev => ({
          ...prev,
          [contact.userName]: "online"
        }));
      }

      console.log("Calling", contact.userName, "using server:", serverToUse);

      // If contact has their own server, set it as active
      if (contact.signalingServerURL) {
        console.log("Setting contact's server as active:", contact.signalingServerURL);
        await identityManager.setActiveSignallingServer(identity.userName, contact.signalingServerURL);
        setSignalingServer(contact.signalingServerURL);
      }

      navigate(`/call/${contact.userName}`, {
        state: {
          contact,
          callInitiated: true,
          signalingServer: serverToUse
        },
      });

      // Clear status after navigation
      setTimeout(() => {
        setServerCheckStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[contact.userName];
          return newStatus;
        });
      }, 1000);

    } catch (err) {
      console.error("Error during call:", err);
      alert("Failed to initiate call: " + err.message);
    }
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

      console.log("Contact deleted:", contact.userName);
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact.");
    }
  };

  /* ---------------- ACCEPT CALL -------- */
  const acceptCall = async () => {
    if (!incomingCall) return;

    console.log("Accepting call at ", Date.now());

    try {
      const serverToUse = incomingCall.contact.signalingServerURL || signalingServer;

      console.log("Checking server connectivity before accepting call from", incomingCall.from);

      // Check if caller's server is reachable
      if (incomingCall.contact.signalingServerURL) {
        console.log("Caller has custom server, checking connectivity:", incomingCall.contact.signalingServerURL);

        const isServerOnline = await checkServerConnectivity(incomingCall.contact.signalingServerURL);

        if (!isServerOnline) {
          console.error(`Caller's server is offline: ${incomingCall.contact.signalingServerURL}`);

          // Decline the call
          wsRef.current.send(
            JSON.stringify({
              type: "call-declined",
              from: identity.userName,
              to: incomingCall.from,
            })
          );

          alert(
            `⚠️ Server Offline\n\n` +
            `${incomingCall.from}'s signaling server is unreachable.\n\n` +
            `Server: ${incomingCall.contact.signalingServerURL}\n\n` +
            `Call has been declined. Please try again later.`
          );

          setIncomingCall(null);
          return;  // Stop call acceptance
        }

        console.log("Caller's server is ONLINE, proceeding with call");
      }

      console.log("Accepting call from", incomingCall.from, "using server:", serverToUse);

      // If caller has their own server, set it as active
      if (incomingCall.contact.signalingServerURL) {
        console.log("Setting caller's server as active:", incomingCall.contact.signalingServerURL);
        await identityManager.setActiveSignallingServer(identity.userName, incomingCall.contact.signalingServerURL);
        setSignalingServer(incomingCall.contact.signalingServerURL);
      }

      navigate(`/call/${incomingCall.from}`, {
        state: {
          contact: incomingCall.contact,
          incomingCall: true,
          signalingServer: serverToUse
        },
      });

      setIncomingCall(null);
    } catch (err) {
      console.error("Error accepting call:", err);
      alert("Failed to accept call: " + err.message);
    }
  };

  /* ---------------- REJECT CALL -------- */
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
        {/* Contacts Section */}
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
                      avatar:
                        contact.avatar ||
                        `https://placehold.co/80x80?text=${contact.userName
                          .charAt(0)
                          .toUpperCase()}`,
                      status: contact.status || 'Available',
                      publicKey: contact.publicKey,
                      signalingServers: contact.signalingServers || []
                    }}
                    allContacts={contacts}
                    onClick={() => handleCall(contact)}
                    onCall={() => handleCall(contact, selectedServer)}
                    onDelete={() => handleDelete(contact)}
                    selectedServer={selectedServer}
                    onSelectServer={setSelectedServer}
                  />

                  {/* Server Status Indicator */}
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
