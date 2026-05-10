import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser } from "../utils/UserContext";
import { SocketManager } from "../utils/UserContext";
import { AuthClient } from "../utils/AuthClient.js";


function toWss(url) {
	if (!url) return url;
	if (url.startsWith("https://")) return url.replace("https://", "wss://");
	if (url.startsWith("http://")) return url.replace("http://", "ws://");
	return url;
}

function toHttp(url) {
	if (!url) return url;
	if (url.startsWith("wss://")) return url.replace("wss://", "https://");
	if (url.startsWith("ws://")) return url.replace("ws://", "http://");
	return url;
}

export default function HomePage() {
	const navigate = useNavigate();
	const { identityManager, addSocket, getSocket, removeSocket, allServerConnected, setAllServerConnected } = useUser();

	const [contacts, setContacts] = useState([]);
	const incomingCallRef = useRef(null);

	const [incomingCall, setIncomingCall] = useState(null);
	const [outgoingCall, setOutgoingCall] = useState(null); // { contact, server }
	const outgoingCallRef = useRef(null); // mirror of outgoingCall for use inside ws callbacks

	const callTimeoutRef = useRef(null);

	const contactsRef = useRef([]);


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

	/* ---------------- WEBSOCKET CONNECTION (for incoming calls) ---------------- */
	useEffect(() => {
		if (!identityManager) return;

		console.log("Connecting to signaling servers:");



		let unsubscribers = [];

		const run = async () => {
			const servers = identityManager.getSignallingServers();
			console.log("servers:", servers);
			if (!allServerConnected) {
				for (const server of servers) {

					const client = new AuthClient(server.url, identityManager);
					let token;

					try {
						token = await client.getValidToken();
						await identityManager.registerSignallingServerAccess(server.url);
						console.log("Got token");
					} catch (err) {
						console.log("Couldn't get token at homepage", err);
						continue;
					}

					if (!token) {
						continue;
					}

					const ws = new WebSocket(server.url); //also handle the token part later
					//ws.send(JSON.stringify({
					//  type: "register",
					//  userName: identity.userName,
					//  publicKey: publicKeyBase64,
					//  token,
					//}));

					ws.onopen = () => {
						console.log("WebSocket connected");
						ws.send(
							JSON.stringify({
								type: "register",
								publicKey: identityManager.getPublicKey(),
								token,
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
							(c) => c.publicKey === data.from
						);

						if (!contact || !contact.signallingServers.includes(server.url)) {
							console.error("Call from unknown contact:", data.from);

							ws.send(
								JSON.stringify({
									type: "call-declined",
									from: identityManager.getPublicKey(),
									to: data.from,
								})
							);

							return;
						}

						if (incomingCall) { // if there is already a incoming call, reject new incoming call
							ws.send(
								JSON.stringify({
									type: "call-declined",
									from: identityManager.getPublicKey(),
									to: data.from,
								})
							);
						}

						setIncomingCall({ from: data.from, contact, server: server.url });
						incomingCallRef.current = { from: data.from, contact, server: server.url };
						console.log("Set from data", incomingCallRef.current);
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

					unsubscriber = sm.subscribe("call-declined", (data) => {
						clearTimeout(callTimeoutRef.current);
						setOutgoingCall(null);
						outgoingCallRef.current = null;
						alert(`${data.from} declined your call.`);
					});

					unsubscribers.push(unsubscriber);

					unsubscriber = sm.subscribe("call-accepted", (data) => {
						console.log("HomePage: call-accepted received, closing WS then navigating");
						clearTimeout(callTimeoutRef.current);
						const oc = outgoingCallRef.current;
						if (!oc) return;
						setOutgoingCall(null);
						outgoingCallRef.current = null;

						navigate(`/call/${oc.contact.userName}`, {
							state: {
								contact: oc.contact,
								callInitiated: true,
								callAlreadyAccepted: true,
								signallingServer: oc.server,
							},
						});
					});

					unsubscribers.push(unsubscriber);

					unsubscriber = sm.subscribe("error", async (data) => {
						await identityManager.clearSignallingServerTokens(server.url);
						removeSocket(server.url);
						console.error("Server error:", data.message || data);
					});

					unsubscribers.push(unsubscriber);

					addSocket(server.url, sm);
				}
				setAllServerConnected(true);
			}
		};
		run();
		return () => {
			console.log("HomePage unmounted");
			unsubscribers.forEach((unsubsriber) => { unsubsriber() });
		};
	}, []);

	/* ---------------- CALL HANDLER - Uses contact's server if available -------- */
	const handleCall = async (contact) => {

		console.log("Calling at ", Date.now());

		try {
			const serverToUse = contact.selectedSignallingServer; // use selectedSignallingServer instead

			if (!serverToUse) {
				alert(`Select a registered signalling server to use.`);
				return;
			};

			//// Check if contact's server is reachable

			// ── Stay on HomePage, send call-request, wait for call-accepted ──
			const oc = { contact, server: serverToUse };
			setOutgoingCall(oc);
			outgoingCallRef.current = oc;

			getSocket(serverToUse).send({
				type: "call-request",
				from: identityManager.getPublicKey(),
				to: contact.publicKey,
			});

			// Timeout if no answer
			callTimeoutRef.current = setTimeout(() => {
				if (outgoingCallRef.current) {
					getSocket(serverToUse).send({ type: "call-cancelled", from: identityManager.getPublicKey(), to: contact.publicKey });
					setOutgoingCall(null);
					outgoingCallRef.current = null;
					alert(`${contact.userName} didn't answer.`);
				}
			}, 30000);

		} catch (err) {
			console.error("Error during call:", err);
			alert("Failed to initiate call: " + err.message);
		}
	};

	/* CANCEL OUTGOING CALL --------------------------------------------------- */
	const cancelOutgoing = () => {
		clearTimeout(callTimeoutRef.current);
		const oc = outgoingCallRef.current;
		getSocket(oc.server).send({ type: "call-cancelled", from: identityManager.getPublicKey(), to: oc.contact.publicKey });
		setOutgoingCall(null);
		outgoingCallRef.current = null;
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

			console.log("Accepting call from", incomingCall.from, "using server:", incomingCall.server);

			getSocket(incomingCallRef.current.server).send({
				type: "call-accepted",
				from: identityManager.getPublicKey(),
				to: incomingCall.from,
			});

			navigate(`/call/${incomingCall.contact.userName}`, {
				state: {
					contact: incomingCall.contact,
					incomingCall: true,
					signallingServer: incomingCall.server,
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
				from: identityManager.getPublicKey(),
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

			{/* INCOMING CALL POPUP */}
			{incomingCall && (
				<div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
					<h2 className="text-2xl text-white mb-4">
						Incoming call from {incomingCall.contact.userName}
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
