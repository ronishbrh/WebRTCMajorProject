import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";
import { arrayBufferToBase64, base64ToArrayBuffer, decryptAES, deriveSharedSecret, encryptAES, generateECDHKeys, importAESKey, importECDSAPublicKey, signChallenge, verifyChallenge } from "../utils/crypto";
import ConnectionTester from "../utils/ConnectionTester";

// Resolution presets
const RESOLUTIONS = {
	low: { width: 640, height: 480, label: "SD (480p)" },
	medium: { width: 1280, height: 720, label: "HD (720p)" },
	high: { width: 1920, height: 1080, label: "Full HD (1080p)" }
};

export default function CallPage() {
	const location = useLocation();
	const contact = location.state?.contact;

	const localVideoRef = useRef(null);
	const remoteVideoRef = useRef(null);
	const localStreamRef = useRef(null);
	const remoteStreamRef = useRef(null);

	const [isVideoOn, setIsVideoOn] = useState(true);
	const [isAudioOn, setIsAudioOn] = useState(true);
	const [error, setError] = useState(null);
	const [showEndCallNotification, setShowEndCallNotification] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [resolution, setResolution] = useState("medium");
	const [liveStats, setLiveStats] = useState({
		downloadBitrate: 0, uploadBitrate: 0, jitter: 0, packetsLost: 0
	});
	const [hasRemoteStream, setHasRemoteStream] = useState(false);

	const pcRef = useRef(null);
	const wsRef = useRef(null);
	const pendingCandidates = useRef([]);
	const pendingIceCandidates = useRef([]);
	const ECDHKeyPair = useRef(null);
	const AESKey = useRef(null);
	const { identity } = useUser();

	const navigate = useNavigate();

	// Determine call role from navigation state
	const callInitiatedFromHome = Boolean(location.state?.callInitiated); // caller
	const incomingCallAccepted = Boolean(location.state?.incomingCall); // callee

	const [isCalling, setIsCalling] = useState(callInitiatedFromHome);
	const [callAnswered, setCallAnswered] = useState(false);
	const callTimeoutRef = useRef(null);

	// --------- PURE FUNCTION (no setState allowed here) ------
	const requestMediaStream = async (resolutionKey) => {
		try {
			const res = RESOLUTIONS[resolutionKey];
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: res.width },
					height: { ideal: res.height }
				},
				audio: true
			});
			return { stream, error: null };
		} catch (err) {
			console.error("Media Device Error:", err);
			return { stream: null, error: "Unable to access camera/microphone. Please grant permissions and refresh." };
		}
	};

	const cleanupMedia = () => {
		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach(t => t.stop());
			localStreamRef.current = null;
		}
		if (remoteStreamRef.current) {
			remoteStreamRef.current.getTracks().forEach(t => t.stop());
			remoteStreamRef.current = null;
		}
		if (pcRef.current) {
			if (pcRef.current._tester) pcRef.current._tester.stop();
			pcRef.current.close();
			pcRef.current = null;
		}
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.close();
			wsRef.current = null;
		}
		if (callTimeoutRef.current) {
			clearTimeout(callTimeoutRef.current);
			callTimeoutRef.current = null;
		}
	};

	const handleSignalingMessage = async (data) => {
		const message = JSON.parse(data);
		const pc = pcRef.current;

		if (message.type === "call-cancelled") {
			// console.log("Caller cancelled the call");
			alert("Call was cancelled");
			cleanupMedia();
			navigate("/");
			return;
		}

		if (message.type === "call-declined") {
			// console.log("Callee declined the call");
			alert(`${contact.userName} declined the call`);
			cleanupMedia();
			navigate("/");
			return;
		}

		if (message.type === "call-accepted") {
			// console.log("Call accepted by callee");
			if (callTimeoutRef.current) {
				clearTimeout(callTimeoutRef.current);
				callTimeoutRef.current = null;
			}
			
			setIsCalling(false);
			setCallAnswered(true);
			// Caller starts handshake when callee accepts
			await startHandshake();
		}

		if (message.type === "join") {
			// Callee receives join from caller then now start challenge flow
			// console.log("Received join, starting challenge");
			const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
			const signature = await signChallenge(identity.privateKey, rawPubKey);
			const msg = {
				type: "challenge1",
				publicKey: arrayBufferToBase64(rawPubKey),
				signature: arrayBufferToBase64(signature),
				from: identity.userName,
				to: contact.userName,
			};
			wsRef.current.send(JSON.stringify(msg));
			console.log("Challenge1 sent");
		}

		if (message.type === "challenge1") {
			console.log("Received challenge1 from", message.from);
			const rawECDH = base64ToArrayBuffer(message.publicKey);
			const signature = base64ToArrayBuffer(message.signature);

			// Import contact's ECDSA public key if its a string
			let contactPublicKey = contact.publicKey;
			if (typeof contactPublicKey === 'string') {
				contactPublicKey = await importECDSAPublicKey(contactPublicKey);
			}

			// console.log("Verifying challenge1 signature...");
			const valid = await verifyChallenge(contactPublicKey, rawECDH, signature);

			if (valid) {
				// console.log("User verified - sending challenge2");
				const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
				const sig = await signChallenge(identity.privateKey, rawPubKey);
				const msg = {
					type: "challenge2",
					publicKey: arrayBufferToBase64(rawPubKey),
					signature: arrayBufferToBase64(sig),
					from: identity.userName,
					to: contact.userName,
				};
				wsRef.current.send(JSON.stringify(msg));
				console.log("Challenge2 sent");

				const publicKey = await crypto.subtle.importKey(
					"raw", rawECDH,
					{ name: "ECDH", namedCurve: "P-256" },
					true, []
				);

				const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, publicKey);
				const aesKey = await importAESKey(sharedSecret);
				AESKey.current = aesKey;
				// console.log("AES key derived");

				// Flush pending ICE candidates now afterwe have AES key
				if (pendingIceCandidates.current.length > 0) {
					console.log(`Flushing ${pendingIceCandidates.current.length} pending ICE candidates`);
					for (const candidate of pendingIceCandidates.current) {
						await sendCandidate(candidate);
					}
					pendingIceCandidates.current = [];
				}
			} else {
				console.error("User Unverified signature failed");
			}
		}

		if (message.type === "challenge2") {
			console.log("Received challenge2 from", message.from);
			const rawECDH = base64ToArrayBuffer(message.publicKey);
			const signature = base64ToArrayBuffer(message.signature);

			// console.log("DEBUG contact object:", contact);
			// console.log("DEBUG contact.publicKey type:", typeof contact.publicKey);
			// console.log("DEBUG contact.publicKey value:", contact.publicKey);

			// Importing contact's ECDSA public key if its a string
			let contactPublicKey = contact.publicKey;
			if (typeof contactPublicKey === 'string') {
				try {
					contactPublicKey = await importECDSAPublicKey(contactPublicKey);
					// console.log("Public key imported successfully, type:", typeof contactPublicKey);
				} catch (error) {
					console.error("Failed to import public key:", error);
					return;
				}
			} else if (!contactPublicKey) {
				// console.error("contact.publicKey is null or undefined!");
				return;
			} else {
				console.log("Public key is already a CryptoKey object");
			}


			const valid = await verifyChallenge(contactPublicKey, rawECDH, signature);

			if (valid) {
				console.log("User verified now creating offer");
				const publicKey = await crypto.subtle.importKey(
					"raw", rawECDH,
					{ name: "ECDH", namedCurve: "P-256" },
					true, []
				);

				const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, publicKey);
				const aesKey = await importAESKey(sharedSecret);
				AESKey.current = aesKey;
		

				// Flush pending ICE candidates
				if (pendingIceCandidates.current.length > 0) {
					console.log(`Flushing ${pendingIceCandidates.current.length} pending ICE candidates`);
					for (const candidate of pendingIceCandidates.current) {
						await sendCandidate(candidate);
					}
					pendingIceCandidates.current = [];
				}

				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);
				console.log("Created offer, local description set");

				const encoder = new TextEncoder();
				const sdpBuffer = encoder.encode(offer.sdp);
				const { iv, encrypted: encryptedSDPBuffer } = await encryptAES(sdpBuffer, aesKey);

				const offerMsg = {
					type: "offer",
					offer: arrayBufferToBase64(encryptedSDPBuffer),
					iv: arrayBufferToBase64(iv),
					from: identity.userName,
					to: contact.userName,
				};
				wsRef.current.send(JSON.stringify(offerMsg));
				console.log("Offer sent");
			} else {
				console.error("User Unverified signature failed");
			}
		}

		if (message.type === "offer") {
			console.log("Received offer from", message.from);
			const iv = base64ToArrayBuffer(message.iv);
			const encryptedSDPBuffer = base64ToArrayBuffer(message.offer);
			const SDPBuffer = await decryptAES(encryptedSDPBuffer, AESKey.current, iv);
			const decoder = new TextDecoder();
			const sdp = decoder.decode(SDPBuffer);

			await pc.setRemoteDescription({ type: "offer", sdp });
		

			// Add queued ICE candidates
			console.log(`Flushing ${pendingCandidates.current.length} queued ICE candidates`);
			for (const c of pendingCandidates.current) {
				try {
					await pc.addIceCandidate(c);
				} catch (e) {
					console.error("Error adding queued ICE candidate", e);
				}
			}
			pendingCandidates.current = [];

			// Send answer
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			console.log("Created and set local description (answer)");

			const encoder = new TextEncoder();
			const ansSdpBuffer = encoder.encode(answer.sdp);
			const { iv: ansiv, encrypted: encryptedAnsSDPBuffer } = await encryptAES(ansSdpBuffer, AESKey.current);

			const answerMsg = {
				type: "answer",
				answer: arrayBufferToBase64(encryptedAnsSDPBuffer),
				iv: arrayBufferToBase64(ansiv),
				from: identity.userName,
				to: contact.userName,
			};
			wsRef.current.send(JSON.stringify(answerMsg));
			console.log("Answer sent");
		}

		if (message.type === "answer") {
			console.log("Received answer from", message.from);
			const iv = base64ToArrayBuffer(message.iv);
			const encryptedSDPBuffer = base64ToArrayBuffer(message.answer);
			const SDPBuffer = await decryptAES(encryptedSDPBuffer, AESKey.current, iv);
			const decoder = new TextDecoder();
			const sdp = decoder.decode(SDPBuffer);

			await pc.setRemoteDescription({ type: "answer", sdp });
			console.log("Set remote description (answer)");

			// Add queued ICE candidates
			console.log(`Flushing ${pendingCandidates.current.length} queued ICE candidates`);
			for (const c of pendingCandidates.current) {
				try {
					await pc.addIceCandidate(c);
				} catch (e) {
					console.error("Error adding queued ICE candidate", e);
				}
			}
			pendingCandidates.current = [];

			setIsCalling(false);
			setCallAnswered(true);
			console.log("Call fully established");
		}

		if (message.type === "ice") {
			console.log("Received ICE candidate from", message.from);
			const iv = base64ToArrayBuffer(message.iv);
			const encryptedCandidateBuffer = base64ToArrayBuffer(message.candidate);
			const candidateBuffer = await decryptAES(encryptedCandidateBuffer, AESKey.current, iv);
			const decoder = new TextDecoder();
			const decodedString = decoder.decode(candidateBuffer);
			const candidateObj = JSON.parse(decodedString);
			const candidate = new RTCIceCandidate(candidateObj);

			if (!pc.currentRemoteDescription) {
				console.log("Queueing ICE candidate (no remote description yet)");
				pendingCandidates.current.push(candidate);
			} else {
				try {
					await pc.addIceCandidate(candidate);
					console.log("Added ICE candidate successfully");
				} catch (e) {
					console.error("Error adding ICE candidate", e);
				}
			}
		}

		if (message.type === "end-call") {
			console.log("Remote user ended call");
			setShowEndCallNotification(true);
			setTimeout(() => {
				cleanupMedia();
				navigate("/");
			}, 3000);
		}
	};

	async function sendCandidate(candidate) {
		if (!AESKey.current) {
			console.warn("AES key not ready so queueing ICE candidate");
			pendingIceCandidates.current.push(candidate);
			return;
		}

		const encoder = new TextEncoder();
		const candidateBuffer = encoder.encode(JSON.stringify(candidate));
		const { iv, encrypted } = await encryptAES(candidateBuffer, AESKey.current);

		wsRef.current.send(JSON.stringify({
			type: "ice",
			candidate: arrayBufferToBase64(encrypted),
			iv: arrayBufferToBase64(iv),
			from: identity.userName,
			to: contact.userName,
		}));
	}

	async function startHandshake() {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			console.error("WS not open so cannot start handshake");
			return;
		}

		console.log("Starting handshake and sending join");
		wsRef.current.send(
			JSON.stringify({
				type: "join",
				from: identity.userName,
				to: contact.userName,
			})
		);
	}

	// --------- INITIAL STARTUP ---------
	useEffect(() => {
		let active = true;

		if (!identity || !contact) {
			console.error("Identity or contact isn't set", { identity, contact });
			navigate("/login");
			return;
		}

		// console.log("CallPage initialized", {
		// 	identity: identity.userName,
		// 	contact: contact.userName,
		// 	callInitiated: callInitiatedFromHome,
		// 	incomingCall: incomingCallAccepted
		// });

		const init = async () => {
			const { stream, error } = await requestMediaStream("medium");

			if (!active) return;

			if (error) {
				setError(error);
				return;
			}

			localStreamRef.current = stream;
			setError(null);

			if (localVideoRef.current) {
				localVideoRef.current.srcObject = stream;
			}

			const pc = new RTCPeerConnection({
				iceServers: [
					{ urls: ["stun:stun.l.google.com:19302"] },
				],
			});
			pcRef.current = pc;

			stream.getTracks().forEach((track) => {
				// console.log("Adding local track to PC:", track.kind, track.enabled);
				pc.addTrack(track, stream);
			});

			pc.ontrack = (event) => {
				// console.log("Received remote track:", event.track.kind, "readyState:", event.track.readyState);
				if (!remoteStreamRef.current) {
					remoteStreamRef.current = new MediaStream();
					remoteVideoRef.current.srcObject = remoteStreamRef.current;
					console.log("Created new remote MediaStream");
				}
				remoteStreamRef.current.addTrack(event.track);
				// console.log("Added track to remote stream. Total tracks:", remoteStreamRef.current.getTracks().length);
				setHasRemoteStream(true);
			};

			pc.oniceconnectionstatechange = () => {
				console.log("ICE Connection State:", pc.iceConnectionState);
				if (pc.iceConnectionState === "connected") {
					const tester = new ConnectionTester(pc, (stats) => {
						setLiveStats({
							downloadBitrate: Math.round(stats.downloadBitrate || 0),
							uploadBitrate: Math.round(stats.uploadBitrate || 0),
							jitter: stats.jitter?.toFixed(3),
							packetsLost: stats.packetsLost
						});
					});
					tester.start(1000);
					pcRef.current._tester = tester;
				}
			};

			pc.onicecandidate = (event) => {
				if (event.candidate) {
					// console.log("Generated ICE candidate:", event.candidate.type);
					sendCandidate(event.candidate);
				} else {
					console.log("ICE gathering complete");
				}
			};

			pc.onconnectionstatechange = () => {
				console.log("Connection State:", pc.connectionState);
			};

			pc.onsignalingstatechange = () => {
				console.log("Signaling State:", pc.signalingState);
			};


			ECDHKeyPair.current = await generateECDHKeys();

			const ws = new WebSocket("ws://localhost:8080");
			wsRef.current = ws;

			ws.onopen = () => {
				console.log("WS connected registering");
				wsRef.current.send(JSON.stringify({ type: "register", userName: identity.userName }));

				// If caller: send call-request and wait for acceptance
				if (callInitiatedFromHome) {
					console.log("Sending call-request as caller");
					setIsCalling(true);
					wsRef.current.send(
						JSON.stringify({
							type: "call-request",
							from: identity.userName,
							to: contact.userName,
						})
					);

					callTimeoutRef.current = setTimeout(() => {
						if (!callAnswered) {
							alert("Call not answered");
							wsRef.current.send(
								JSON.stringify({
									type: "call-cancelled",
									from: identity.userName,
									to: contact.userName,
								})
							);
							cleanupMedia();
							navigate("/");
						}
					}, 30000);
				}

				// If callee: notify caller we accepted and start handshake
				if (incomingCallAccepted) {
					console.log("Sending call-accepted as callee");
					setCallAnswered(true);
					wsRef.current.send(
						JSON.stringify({
							type: "call-accepted",
							from: identity.userName,
							to: contact.userName,
						})
					);
					// Callee waits for caller's "join" message
				}
			};

			ws.onmessage = (msg) => {
				console.log("Message received:", msg.data);
				handleSignalingMessage(msg.data);
			};

			ws.onerror = (e) => {
				console.error("WebSocket error", e);
			};
		};

		init();

		return () => {
			active = false;
			cleanupMedia();
		};
	}, []);

	const cancelCalling = () => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: "call-cancelled",
					from: identity.userName,
					to: contact.userName,
				})
			);
		}
		cleanupMedia();
		navigate("/");
	};

	// -------- RESOLUTION CHANGE ----------
	const handleResolutionChange = async (newRes) => {
		setResolution(newRes);

		const { stream: newStream, error } = await requestMediaStream(newRes);

		if (error) {
			setError(error);
			return;
		}

		const pc = pcRef.current;
		if (pc && localStreamRef.current) {
			const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
			const newVideoTrack = newStream.getVideoTracks()[0];

			const videoSender = pc.getSenders().find(sender => sender.track?.kind === 'video');
			if (videoSender && newVideoTrack) {
				await videoSender.replaceTrack(newVideoTrack);
			}

			const localVideoTracks = localVideoRef.current.srcObject.getTracks();
			const updatedTracks = localVideoTracks.filter(t => t.kind !== 'video').concat(newVideoTrack);
			localVideoRef.current.srcObject = new MediaStream(updatedTracks);

			oldVideoTrack.stop();

			const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
			const combinedStream = new MediaStream([newVideoTrack, oldAudioTrack]);
			localStreamRef.current = combinedStream;
		} else {
			localStreamRef.current = newStream;
			if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
			if (pc) {
				newStream.getTracks().forEach(track => pc.addTrack(track, newStream));
			}
		}

		setShowSettings(false);
	};

	const toggleVideo = () => {
		if (!localStreamRef.current) return;
		const track = localStreamRef.current.getVideoTracks()[0];
		if (track) {
			track.enabled = !track.enabled;
			setIsVideoOn(track.enabled);
		}
	};

	const toggleAudio = () => {
		if (!localStreamRef.current) return;
		const track = localStreamRef.current.getAudioTracks()[0];
		if (track) {
			track.enabled = !track.enabled;
			setIsAudioOn(track.enabled);
		}
	};

	const handleEndCall = () => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({
				type: "end-call",
				from: identity.userName,
				to: contact.userName,
			}));
		}
		cleanupMedia();
		navigate("/");
	};

	return (
		<div className="w-[80%] h-[80%] border-2 flex flex-col bg-black overflow-hidden">
			{/* CALLING overlay for caller */}
			{isCalling && (
				<div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-50">
					<p className="text-white text-lg mb-4">Calling {contact.userName}...</p>
					<div className="flex gap-3">
						<button onClick={cancelCalling} className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600">Cancel</button>
					</div>
				</div>
			)}

			<div className="flex-1 relative text-white flex items-stretch">
				{/* Remote video */}
				<div className="flex-1 flex items-center justify-center bg-gray-800 overflow-hidden">
					<video
						ref={remoteVideoRef}
						autoPlay
						playsInline
						className="w-full h-full object-contain"
					/>
					{!hasRemoteStream && (
						<p className="absolute text-lg opacity-60 px-4">
							Waiting for remote user...
						</p>
					)}
				</div>

				{/* Local video preview */}
				<div className="absolute top-4 right-4 w-40 h-32 sm:w-48 sm:h-36 bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-700 shadow-xl">
					<video
						ref={localVideoRef}
						autoPlay
						playsInline
						muted
						className="w-full h-full object-contain"
						style={{ transform: "scaleX(-1)" }}
					/>
					{!isVideoOn && (
						<div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
							<span className="text-4xl">👤</span>
						</div>
					)}
					<div className="absolute bottom-1 left-1 bg-black bg-opacity-70 px-2 text-xs rounded">
						You • {RESOLUTIONS[resolution].label}
					</div>
				</div>

				{/* Error message */}
				{error && (
					<div className="absolute top-4 left-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-md text-sm">
						{error}
					</div>
				)}

				{/* End Call Notification */}
				{showEndCallNotification && (
					<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-900 border-2 border-red-500 text-white px-8 py-6 rounded-lg shadow-2xl z-50 text-center">
						<div className="text-4xl mb-3">📞</div>
						<div className="text-lg font-semibold">Call Ended</div>
						<div className="text-sm text-gray-400 mt-2">Remote user ended the call</div>
					</div>
				)}

				{/* Settings panel */}
				{showSettings && (
					<div className="absolute top-20 right-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-64">
						<h3 className="text-sm font-semibold mb-3">Video Quality</h3>
						{Object.entries(RESOLUTIONS).map(([key, value]) => (
							<button
								key={key}
								onClick={() => handleResolutionChange(key)}
								className={`w-full px-3 py-2 rounded mb-2 text-left ${resolution === key
									? "bg-blue-600 text-white"
									: "bg-gray-800 text-gray-300 hover:bg-gray-700"
									}`}
							>
								<div className="font-medium text-sm">{value.label}</div>
								<div className="text-xs opacity-70">
									{value.width} × {value.height}
								</div>
							</button>
						))}
						<p className="text-xs text-gray-400 mt-3 border-t pt-2">
							Higher quality uses more bandwidth.
						</p>
					</div>
				)}

				{/* Bottom controls */}
				<div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
					<button
						onClick={handleEndCall}
						className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium shadow-lg"
					>
						End Call
					</button>

					<div className="flex gap-3 bg-gray-800 bg-opacity-80 rounded-full p-2 shadow-lg backdrop-blur">
						<button
							onClick={toggleAudio}
							className={`p-3 rounded-full transition ${isAudioOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"
								}`}
						>
							<span className="text-xl">{isAudioOn ? "🎙️" : "🔇"}</span>
						</button>

						<button
							onClick={toggleVideo}
							className={`p-3 rounded-full transition ${isVideoOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"
								}`}
						>
							<span className="text-xl">{isVideoOn ? "🎥" : "📷"}</span>
						</button>

						<button
							onClick={() => setShowSettings(!showSettings)}
							className={`p-3 rounded-full ${showSettings ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
								}`}
						>
							<span className="text-xl">⚙️</span>
						</button>
					</div>

					<div className="absolute bottom-4 left-4 bg-black/70 px-3 py-2 rounded text-xs text-green-300">
						<div>⬇ Download: {liveStats.downloadBitrate} kbps</div>
						<div>⬆ Upload: {liveStats.uploadBitrate} kbps</div>
						<div>Jitter: {liveStats.jitter} s</div>
						<div>Lost: {liveStats.packetsLost}</div>
					</div>
				</div>
			</div>
		</div>
	);
}