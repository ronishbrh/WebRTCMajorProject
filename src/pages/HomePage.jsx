import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser } from "../utils/UserContext";
import { SocketManager } from "../utils/UserContext";


export default function HomePage() {
	const navigate = useNavigate();
	const { identityManager, addSocket, getSocket, removeSocket, allServerConnected, setAllServerConnected } = useUser();

	const [contacts, setContacts] = useState([]);
	const incomingCallRef = useRef(null);
	const [incomingCall, setIncomingCall] = useState(null);
	//const [signalingServer, setSignalingServer] = useState(null);

	//const [selectedServer, setSelectedServer] = useState(
	//  localStorage.getItem("selectedSignalingServer") || null
	//);

	//const wsRef = useRef(null);
	//const registeredRef = useRef(false);
	const contactsRef = useRef([]);

	//useEffect(() => {
	//  if (selectedServer) {
	//    localStorage.setItem("selectedSignalingServer", selectedServer);
	//  }
	//}, [selectedServer]);

	/* LOAD SIGNALING SERVER (active server) ---------------- */
	//useEffect(() => {
	//  if (!identityManager) {
	//    navigate("/login");
	//    return;
	//  }

	//  const loadServer = async () => {
	//    const server = await identityManager.getActiveSignallingServer();

	//    // fallback to Render server if none stored
	//    const finalServer =
	//      server || "wss://webrtc-signaling-server-up3e.onrender.com";

	//    console.log("Using active signaling server:", finalServer);
	//    setSignalingServer(finalServer);
	//  };

	//  loadServer();
	//}, [identityManager, navigate]);


	/* ---------------- LOAD CONTACTS ---------------- */
	useEffect(() => {
		if (!identityManager) {
			navigate("/login");
			return;
		}

		const loadContacts = async () => {
			const list = await identityManager.getContacts();
			setContacts(list);
			contactsRef.current = list;
			console.log("Loaded contacts:", list);
		};

		loadContacts();
	}, [identityManager]);

	if (!identityManager) return;

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
		if (!identityManager) return;

		console.log("Connecting to signaling servers:");

		const servers = identityManager.getSignallingServers();

		console.log("servers:", servers);

		let unsubscribers = [];

		if (!allServerConnected) {
			for (const server of servers) {

				const ws = new WebSocket(server.url); //also handle the token part later

				ws.onopen = () => {
					console.log("WebSocket connected");
					ws.send(
						JSON.stringify({
							type: "register",
							userName: identityManager.getUserName(),
						})
					);

					console.log("User registered on signaling server");
				}

				ws.onerror = (err) => {
					console.error("WebSocket error:", err);
				};

				ws.onclose = () => {
					console.log("WebSocket disconnected");
				};

				const sm = new SocketManager(ws);

				let unsubscriber = sm.subscribe("call-request", (data) => {
					const contact = contactsRef.current.find(
						(c) => c.userName === data.from
					);

					if (!contact || !contact.signallingServers.includes(server.url)) {
						console.error("Call from unknown contact:", data.from);

						ws.send(
							JSON.stringify({
								type: "call-declined",
								from: identityManager.getUserName(),
								to: data.from,
							})
						);

						return;
					}

					if (incomingCall) { // if there is already a incoming call, reject new incoming call
						ws.send(
							JSON.stringify({
								type: "call-declined",
								from: identityManager.getUserName(),
								to: data.from,
							})
						);
					}

					setIncomingCall({ from: data.from, contact, server:server.url });
					incomingCallRef.current = { from: data.from, contact, server:server.url };
					console.log("Set from data", incomingCall);
					console.log("Call request received at ", Date.now());
				});

				unsubscribers.push(unsubscriber);

				unsubscriber = sm.subscribe("call-cancelled", (data) => {
					if (incomingCallRef.current.from === data.from) {
						setIncomingCall(null);
						incomingCallRef.current = null;
						alert(`${data.from} cancelled the call`);
					}
				});

				unsubscribers.push(unsubscriber);

				//sm.subscribe("call-declined", (data) => {
				//	if (incomingCall?.from === data.from) {
				//		alert(`${data.from} declined your call.`);
				//	}
				//});

				addSocket(server.url, sm);
			}
			setAllServerConnected(true);
		}

		return () => {
			console.log("HomePage unmounted");
			unsubscribers.forEach((unsubsriber) => { unsubsriber() });
		};
	}, []);

	/* ---------------- CALL HANDLER - Uses contact's server if available -------- */
	const handleCall = async (contact) => {
		//if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
		//	alert("Connection not ready. Please wait.");
		//	return;
		//}

		console.log("Calling at ", Date.now());

		try {
			const serverToUse = contact.selectedSignallingServer; // use selectedSignallingServer instead

			//console.log("Checking server connectivity before calling", contact.userName);

			//// Check if contact's server is reachable
			//if (contact.signallingServerURL) {
			//	console.log("Contact has custom server, checking connectivity:", contact.selectedSignallingServer);

			//	setServerCheckStatus(prev => ({
			//		...prev,
			//		[contact.userName]: "checking"
			//	}));

			//	const isServerOnline = await checkServerConnectivity(contact.selectedSignallingServer);

			//	if (!isServerOnline) {
			//		console.error(`Contact's server is offline: ${contact.selectedSignallingServer}`);

			//		setServerCheckStatus(prev => ({
			//			...prev,
			//			[contact.userName]: "offline"
			//		}));

			//		// Show alert
			//		alert(
			//			`⚠️ Server Offline\n\n` +
			//			`${contact.userName}'s signaling server is unreachable.\n\n` +
			//			`Server: ${contact.selectedSignallingServer}\n\n` +
			//			`Please try again later or contact ${contact.userName} to check their server status.`
			//		);

			//		setTimeout(() => {
			//			setServerCheckStatus(prev => {
			//				const newStatus = { ...prev };
			//				delete newStatus[contact.userName];
			//				return newStatus;
			//			});
			//		}, 3000);

			//		return;  // Stop call attempt
			//	}

			//	console.log("Contact's server is ONLINE, proceeding with call");
			//	setServerCheckStatus(prev => ({
			//		...prev,
			//		[contact.userName]: "online"
			//	}));
			//}

			console.log("Calling", contact.userName, "using server:", serverToUse);

			navigate(`/call/${contact.userName}`, {
				state: {
					contact,
					callInitiated: true,
					server: serverToUse
				},
			});

			// Clear status after navigation
			//setTimeout(() => {
			//	setServerCheckStatus(prev => {
			//		const newStatus = { ...prev };
			//		delete newStatus[contact.userName];
			//		return newStatus;
			//	});
			//}, 1000);

		} catch (err) {
			console.error("Error during call:", err);
			alert("Failed to initiate call: " + err.message);
		}
	};

	/* ---------------- DELETE CONTACT ---------------- */
	const handleDelete = async (contact) => {
		try {
			await identityManager.deleteContact(
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
			//console.log("Checking server connectivity before accepting call from", incomingCall.from);

			//// Check if caller's server is reachable
			//if (incomingCall.contact.signalingServers[0]) {
			//	console.log("Caller has custom server, checking connectivity:", incomingCall.server);

			//	const isServerOnline = await checkServerConnectivity(incomingCall.server);

			//	if (!isServerOnline) {
			//		console.error(`Caller's server is offline: ${incomingCall.contact.signalingServerURL}`);

			//		removeSocket(incomingCall.server);

			//		alert(
			//			`⚠️ Server Offline\n\n` +
			//			`${incomingCall.from}'s signaling server is unreachable.\n\n` +
			//			`Server: ${incomingCall.contact.signalingServerURL}\n\n` +
			//			`Call has been declined. Please try again later.`
			//		);

			//		setIncomingCall(null);
			//		return;  // Stop call acceptance
			//	}

			//	console.log("Caller's server is ONLINE, proceeding with call");
			//}

			console.log("Accepting call from", incomingCall.from, "using server:", incomingCall.server);


			navigate(`/call/${incomingCall.from}`, {
				state: {
					contact: incomingCall.contact,
					incomingCall: true,
					server: incomingCall.server,
				},
			});

			setIncomingCall(null);
			incomingCallRef.current = null;
		} catch (err) {
			console.error("Error accepting call:", err);
			alert("Failed to accept call: " + err.message);
		}
	};

	/* ---------------- REJECT CALL -------- */
	const rejectCall = () => {
		if (!incomingCall) return;

		getSocket(incomingCall.server).send(
			{
				type: "call-declined",
				from: identityManager.getUserName(),
				to: incomingCall.from,
			}
		);

		setIncomingCall(null);
		incomingCallRef.current = null;
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
											signalingServers: contact.signallingServers || [],
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
