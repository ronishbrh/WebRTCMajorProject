import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";
import {
	arrayBufferToBase64, base64ToArrayBuffer, decryptAES,
	deriveSharedSecret, encryptAES, generateECDHKeys, importAESKey,
	importECDSAPrivateKey,
	importECDSAPublicKey, signChallenge, verifyChallenge
} from "../utils/crypto";
import ConnectionTester from "../utils/ConnectionTester";
import { getIceServersConfig } from "../utils/meterredTurnServer";
import { FiCamera, FiCameraOff, FiMic, FiMicOff, FiPhoneCall, FiSettings } from "react-icons/fi";

// Resolution presets
const RESOLUTIONS = {
	low: { width: 640, height: 480, label: "SD (480p)" },
	medium: { width: 1280, height: 720, label: "HD (720p)" },
	high: { width: 1920, height: 1080, label: "Full HD (1080p)" }
};

// ── URL helpers ──────────────────────────────────────────────────────────────
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

export default function CallPage() {
	const location = useLocation();
	const contact = location.state?.contact;
	const [signallingServer, _setSignallingServer] = useState(
		location.state?.signallingServer || null
	);

	const localVideoRef = useRef(null);
	const remoteVideoRef = useRef(null);
	const localStreamRef = useRef(null);
	const remoteStreamRef = useRef(null);

	const [isVideoOn, setIsVideoOn] = useState(true);
	const [isAudioOn, setIsAudioOn] = useState(true);
	const [error, setError] = useState(null);
	const [showEndCallNotification, setShowEndCallNotification] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [showStats, setShowStats] = useState(false);
	const [resolution, setResolution] = useState("medium");
	const [liveStats, setLiveStats] = useState({
		downloadBitrate: 0, uploadBitrate: 0, jitter: 0, packetsLost: 0, rtt: "N/A",
		inboundFPS: 0, inboundResolutionWidth: 0, inboundResolutionHeight: 0,
		outboundFPS: 0, outboundResolutionWidth: 0, outboundResolutionHeight: 0,
	});
	const [hasRemoteStream, setHasRemoteStream] = useState(false);

	const [controlsVisible, setControlsVisible] = useState(true);
	const controlsTimerRef = useRef(null);

	const [showError, setShowError] = useState(false);

	const pcRef = useRef(null);
	const wsRef = useRef(null);
	const pendingCandidates = useRef([]);
	const pendingIceCandidates = useRef([]);
	const ECDHKeyPair = useRef(null);
	const AESKey = useRef(null);

	const { identityManager, getSocket, closeAllSocketsExcept, closeAllSockets } = useUser();

	const navigate = useNavigate();

	const callInitiatedFromHome = Boolean(location.state?.callInitiated);
	const callAlreadyAccepted = Boolean(location.state?.callAlreadyAccepted); // callee accepted while still on HomePage
	const incomingCallAccepted = Boolean(location.state?.incomingCall);

	const callTimeoutRef = useRef(null);

	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
	}, []);


	useEffect(() => {
		showControls();
		return () => {
			if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
		};
	}, [showControls]);

	// ---- Media helpers ----
	const requestMediaStream = async (resolutionKey) => {
		try {
			const res = RESOLUTIONS[resolutionKey];
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { width: { ideal: res.width }, height: { ideal: res.height } },
				audio: true
			});
			return { stream, error: null };
		} catch (err) {
			console.error("Media Device Error:", err);
			return { stream: null, error: "Unable to access camera/microphone. Please grant permissions and refresh." };
		}
	};

	const cleanupMedia = useCallback(() => {
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
		if (callTimeoutRef.current) {
			clearTimeout(callTimeoutRef.current);
			callTimeoutRef.current = null;
		}
	}, []);

	const endCallAndNavigate = useCallback(() => {
		cleanupMedia();
		closeAllSockets();
		navigate("/");
	}, [cleanupMedia, navigate]);

	const handleEndCall = useCallback(() => {
		if (wsRef.current && wsRef.current.ws.readyState === WebSocket.OPEN) {
			wsRef.current.send({
				type: "end-call",
				from: identityManager.getPublicKey(),
				to: contact.publicKey,
			});
		}
		endCallAndNavigate();
	}, [identityManager, contact, endCallAndNavigate]);

	async function sendCandidate(candidate) {
		if (!AESKey.current) { pendingIceCandidates.current.push(candidate); return; }
		const candidateBuffer = new TextEncoder().encode(JSON.stringify(candidate));
		const { iv, encrypted } = await encryptAES(candidateBuffer, AESKey.current);
		wsRef.current.send({
			type: "ice",
			candidate: arrayBufferToBase64(encrypted),
			iv: arrayBufferToBase64(iv),
			from: identityManager.getPublicKey(),
			to: contact.publicKey,
		});
	}

	function startHandshake() {
		wsRef.current.send({ type: "join", from: identityManager.getPublicKey(), to: contact.publicKey });
	}

	useEffect(() => {
		if (error) {
			setShowError(true);
			const timer = setTimeout(() => setShowError(false), 5000);
			return () => clearTimeout(timer);
		}
	}, [error]);

	// ---- Init ----
	useEffect(() => {
		let active = true;

		let unsubscribers = [];

		if (!identityManager || !contact || !signallingServer) {
			if (!identityManager || !contact) navigate("/login");
			return;
		}

		const init = async () => {
			const { stream, error: streamError } = await requestMediaStream("medium");
			if (!active) return;
			if (streamError) { setError(streamError); return; }

			localStreamRef.current = stream;
			setError(null);
			if (localVideoRef.current) localVideoRef.current.srcObject = stream;

			let manualTurnServers = [];
			try { manualTurnServers = await identityManager.getTurnServers(); }
			catch (err) { console.error("Failed to load manual TURN servers:", err); }

			let iceServersConfig = await getIceServersConfig(manualTurnServers);
			const customStun = localStorage.getItem("activeStun") || "stun:stun.l.google.com:19302";
			iceServersConfig.iceServers.unshift({ urls: [customStun] });

			const pc = new RTCPeerConnection(iceServersConfig);
			pcRef.current = pc;

			stream.getTracks().forEach(track => pc.addTrack(track, stream));

			pc.ontrack = (event) => {
				if (!remoteStreamRef.current) {
					remoteStreamRef.current = new MediaStream();
					if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
				}
				remoteStreamRef.current.addTrack(event.track);
				setHasRemoteStream(true);
			};

			pc.oniceconnectionstatechange = () => {
				if (pc.iceConnectionState === "connected") {
					const tester = new ConnectionTester(pc, (stats) => {
						setLiveStats({
							downloadBitrate: (Math.round(stats.downloadBitrate || 0) / 8000).toFixed(1),
							uploadBitrate: (Math.round(stats.uploadBitrate || 0) / 8000).toFixed(1),
							jitter: stats.jitter?.toFixed(3),
							packetsLost: stats.packetsLost,
							rtt: stats.rtt ? stats.rtt.toFixed(1) : null,
							inboundFPS: stats.inboundFPS ?? null,
							inboundResolutionWidth: stats.inboundResolutionWidth ?? null,
							inboundResolutionHeight: stats.inboundResolutionHeight ?? null,
							outboundFPS: stats.outboundFPS ?? null,
							outboundResolutionWidth: stats.outboundResolutionWidth ?? null,
							outboundResolutionHeight: stats.outboundResolutionHeight ?? null,
						});
					});
					console.log("Call established at", Date.now());
					tester.start(1000);
					pcRef.current._tester = tester;
				}
			};

			pc.onicecandidate = (event) => {
				if (event.candidate) sendCandidate(event.candidate);
			};

			ECDHKeyPair.current = await generateECDHKeys();

			closeAllSocketsExcept(signallingServer);
			wsRef.current = getSocket(signallingServer);

			let unsubscriber = wsRef.current.subscribe("join", async (_data) => {
				const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
				const signature = await signChallenge(await importECDSAPrivateKey(identityManager.getPrivateKey()), rawPubKey);
				wsRef.current.send({
					type: "challenge1",
					publicKey: arrayBufferToBase64(rawPubKey),
					signature: arrayBufferToBase64(signature),
					from: identityManager.getPublicKey(),
					to: contact.publicKey,
				});
			});

			unsubscribers.push(unsubscriber);

			unsubscriber = wsRef.current.subscribe("challenge1", async (data) => {
				const rawECDH = base64ToArrayBuffer(data.publicKey);
				const signature = base64ToArrayBuffer(data.signature);
				let contactPublicKey = await importECDSAPublicKey(contact.publicKey);
				if (typeof contactPublicKey === "string") contactPublicKey = await importECDSAPublicKey(contactPublicKey);

				const valid = await verifyChallenge(contactPublicKey, rawECDH, signature);
				if (valid) {
					const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
					const sig = await signChallenge(await importECDSAPrivateKey(identityManager.getPrivateKey()), rawPubKey);
					wsRef.current.send({
						type: "challenge2",
						publicKey: arrayBufferToBase64(rawPubKey),
						signature: arrayBufferToBase64(sig),
						from: identityManager.getPublicKey(),
						to: contact.publicKey,
					});

					const publicKey = await crypto.subtle.importKey("raw", rawECDH, { name: "ECDH", namedCurve: "P-256" }, true, []);
					const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, publicKey);
					AESKey.current = await importAESKey(sharedSecret);

					if (pendingIceCandidates.current.length > 0) {
						for (const candidate of pendingIceCandidates.current) await sendCandidate(candidate);
						pendingIceCandidates.current = [];
					}
				} else {
					console.error("Unverified signature in challenge1");
				}
			});

			unsubscribers.push(unsubscriber);


			unsubscriber = wsRef.current.subscribe("challenge2", async (data) => {
				const rawECDH = base64ToArrayBuffer(data.publicKey);
				const signature = base64ToArrayBuffer(data.signature);
				let contactPublicKey = contact.publicKey;
				if (typeof contactPublicKey === "string") {
					try { contactPublicKey = await importECDSAPublicKey(contactPublicKey); }
					catch (e) { console.error("Failed to import public key:", e); return; }
				} else if (!contactPublicKey) return;

				const valid = await verifyChallenge(contactPublicKey, rawECDH, signature);
				if (valid) {
					const publicKey = await crypto.subtle.importKey("raw", rawECDH, { name: "ECDH", namedCurve: "P-256" }, true, []);
					const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, publicKey);
					AESKey.current = await importAESKey(sharedSecret);

					if (pendingIceCandidates.current.length > 0) {
						for (const candidate of pendingIceCandidates.current) await sendCandidate(candidate);
						pendingIceCandidates.current = [];
					}

					const offer = await pc.createOffer();
					await pc.setLocalDescription(offer);

					const encoder = new TextEncoder();
					const sdpBuffer = encoder.encode(offer.sdp);
					const { iv, encrypted } = await encryptAES(sdpBuffer, AESKey.current);
					wsRef.current.send({
						type: "offer",
						offer: arrayBufferToBase64(encrypted),
						iv: arrayBufferToBase64(iv),
						from: identityManager.getPublicKey(),
						to: contact.publicKey,
					});
				} else {
					console.error("Unverified signature in challenge2");
				}
			});

			unsubscribers.push(unsubscriber);

			unsubscriber = wsRef.current.subscribe("offer", async (data) => {
				const iv = base64ToArrayBuffer(data.iv);
				const encryptedSDPBuffer = base64ToArrayBuffer(data.offer);
				const SDPBuffer = await decryptAES(encryptedSDPBuffer, AESKey.current, iv);
				const sdp = new TextDecoder().decode(SDPBuffer);
				await pc.setRemoteDescription({ type: "offer", sdp });

				for (const c of pendingCandidates.current) {
					try { await pc.addIceCandidate(c); } catch (e) { console.error("ICE candidate error", e); }
				}
				pendingCandidates.current = [];

				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				const ansSdpBuffer = new TextEncoder().encode(answer.sdp);
				const { iv: ansiv, encrypted: encAns } = await encryptAES(ansSdpBuffer, AESKey.current);
				wsRef.current.send({
					type: "answer",
					answer: arrayBufferToBase64(encAns),
					iv: arrayBufferToBase64(ansiv),
					from: identityManager.getPublicKey(),
					to: contact.publicKey,
				});
			});

			unsubscribers.push(unsubscriber);

			unsubscriber = wsRef.current.subscribe("answer", async (data) => {
				const iv = base64ToArrayBuffer(data.iv);
				const encryptedSDPBuffer = base64ToArrayBuffer(data.answer);
				const SDPBuffer = await decryptAES(encryptedSDPBuffer, AESKey.current, iv);
				const sdp = new TextDecoder().decode(SDPBuffer);
				await pc.setRemoteDescription({ type: "answer", sdp });

				for (const c of pendingCandidates.current) {
					try { await pc.addIceCandidate(c); } catch (e) { console.error("ICE candidate error", e); }
				}
				pendingCandidates.current = [];
			});

			unsubscribers.push(unsubscriber);

			unsubscriber = wsRef.current.subscribe("ice", async (data) => {
				const iv = base64ToArrayBuffer(data.iv);
				const encryptedCandidateBuffer = base64ToArrayBuffer(data.candidate);
				const candidateBuffer = await decryptAES(encryptedCandidateBuffer, AESKey.current, iv);
				const candidate = new RTCIceCandidate(JSON.parse(new TextDecoder().decode(candidateBuffer)));

				if (!pc.currentRemoteDescription) {
					pendingCandidates.current.push(candidate);
				} else {
					try { await pc.addIceCandidate(candidate); }
					catch (e) { console.error("ICE candidate error", e); }
				}
			});

			unsubscribers.push(unsubscriber);

			unsubscriber = wsRef.current.subscribe("end-call", async (_data) => {
				console.log("Remote user ended call");
				setShowEndCallNotification(true);
				setTimeout(() => {
					endCallAndNavigate();
				}, 2500);
			});

			unsubscribers.push(unsubscriber);

			if (callInitiatedFromHome && callAlreadyAccepted) {
				startHandshake();
			}

			if (incomingCallAccepted) {
				// Callee: we accepted on HomePage which already sent call-accepted.
				// Just register and wait for the caller's "join" message.
				console.log("incomingCallAccepted: callee registered, waiting for join");
			}
		};

		init();

		return () => {
			active = false;
			cleanupMedia();
			unsubscribers.forEach((unsubscriber) => { unsubscriber() });
		};

	}, []);

	if (!identityManager) return;

	const handleResolutionChange = async (newRes) => {
		setResolution(newRes);
		const { stream: newStream, error: streamError } = await requestMediaStream(newRes);
		if (streamError) { setError(streamError); return; }

		const pc = pcRef.current;
		if (pc && localStreamRef.current) {
			const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
			const newVideoTrack = newStream.getVideoTracks()[0];
			const videoSender = pc.getSenders().find(s => s.track?.kind === "video");
			if (videoSender && newVideoTrack) await videoSender.replaceTrack(newVideoTrack);

			if (localVideoRef.current) {
				localVideoRef.current.srcObject = new MediaStream(
					[...localVideoRef.current.srcObject.getTracks().filter(t => t.kind !== "video"), newVideoTrack]
				);
			}
			oldVideoTrack.stop();
			const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
			localStreamRef.current = new MediaStream([newVideoTrack, oldAudioTrack]);
		} else {
			localStreamRef.current = newStream;
			if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
			if (pc) newStream.getTracks().forEach(t => pc.addTrack(t, newStream));
		}
		setShowSettings(false);
	};

	const toggleVideo = () => {
		if (!localStreamRef.current) return;
		const track = localStreamRef.current.getVideoTracks()[0];
		if (track) { track.enabled = !track.enabled; setIsVideoOn(track.enabled); }
	};

	const toggleAudio = () => {
		if (!localStreamRef.current) return;
		const track = localStreamRef.current.getAudioTracks()[0];
		if (track) { track.enabled = !track.enabled; setIsAudioOn(track.enabled); }
	};

	const StatsPanel = ({ compact = false }) => (
		<div className={`bg-black/80 backdrop-blur rounded-lg text-green-300 font-mono ${compact ? "text-xs p-2 grid grid-cols-2 gap-x-3 gap-y-0.5" : "text-xs p-3 space-y-0.5"}`}>
			<div>⬇ {liveStats.downloadBitrate} kBps</div>
			<div>⬆ {liveStats.uploadBitrate} kBps</div>
			<div>📶 {liveStats.rtt ? `${liveStats.rtt} ms` : "N/A"}</div>
			<div>Jitter: {liveStats.jitter ? `${(liveStats.jitter * 1000).toFixed(1)} ms` : "—"}</div>
			<div>Lost: {liveStats.packetsLost ?? "—"}</div>
			<div>In FPS: {liveStats.inboundFPS ?? "—"}</div>
			<div>Out FPS: {liveStats.outboundFPS ?? "—"}</div>
			<div>In Res: {liveStats.inboundResolutionWidth && liveStats.inboundResolutionHeight ? `${liveStats.inboundResolutionWidth}×${liveStats.inboundResolutionHeight}` : "—"}</div>
			<div className={compact ? "col-span-2" : ""}>Out Res: {liveStats.outboundResolutionWidth && liveStats.outboundResolutionHeight ? `${liveStats.outboundResolutionWidth}×${liveStats.outboundResolutionHeight}` : "—"}</div>
		</div>
	);

	const SettingsPanel = () => (
		<div className="bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl p-4 w-56">
			<h3 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Video Quality</h3>
			<div className="space-y-1.5">
				{Object.entries(RESOLUTIONS).map(([key, value]) => (
					<button key={key} onClick={() => handleResolutionChange(key)}
						className={`w-full px-3 py-2 rounded-lg text-left text-xs transition ${resolution === key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
						<div className="font-medium">{value.label}</div>
						<div className="opacity-60">{value.width} × {value.height}</div>
					</button>
				))}
			</div>
			<p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-700">Higher quality uses more bandwidth.</p>
		</div>
	);

	const EndCallOverlay = () => (
		<div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
			<div className="bg-gray-900 border-2 border-red-500 text-white px-8 py-6 rounded-2xl shadow-2xl text-center">
				<div className="text-4xl mb-3 text-red-400"><FiPhoneCall /></div>
				<div className="text-lg font-semibold">Call Ended</div>
				<div className="text-sm text-gray-400 mt-1">Remote user ended the call</div>
				<div className="text-xs text-gray-500 mt-3 animate-pulse">Redirecting…</div>
			</div>
		</div>
	);

	return (
		<div className="fixed inset-0 bg-black text-white overflow-hidden" onClick={showControls}>
			<video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-contain" />

			{!hasRemoteStream && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<p className="text-gray-400 text-base">Waiting for {contact?.userName}…</p>
				</div>
			)}

			<div className="absolute top-3 right-3 w-28 h-20 sm:w-36 sm:h-28 lg:w-44 lg:h-32 rounded-xl overflow-hidden border border-gray-600 shadow-2xl z-10">
				<video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
				{!isVideoOn && (
					<div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
						<span className="text-3xl">👤</span>
					</div>
				)}
				<div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 text-xs rounded text-gray-300">
					{RESOLUTIONS[resolution].label}
				</div>
			</div>

			<button onClick={(e) => { e.stopPropagation(); setShowStats(s => !s); showControls(); }}
				className={`absolute top-3 left-3 z-20 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${showStats ? "bg-green-700 text-white" : "bg-black/60 text-green-400 hover:bg-black/80"}`}>
				📊 Stats
			</button>

			{showStats && (
				<div className="absolute top-12 left-3 z-20 max-w-xs" onClick={e => e.stopPropagation()}>
					<StatsPanel compact={false} />
				</div>
			)}

			{showError && error && (
				<div className="absolute top-14 left-3 z-20 bg-red-700/90 text-white px-4 py-2 rounded-lg text-sm shadow-lg max-w-xs">{error}</div>
			)}

			{showSettings && (
				<div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30" onClick={e => e.stopPropagation()}>
					<SettingsPanel />
				</div>
			)}

			<div className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 sm:gap-4 px-4 py-4 sm:py-5 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 md:opacity-100 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
				onClick={e => e.stopPropagation()}>
				<button onClick={toggleAudio}
					className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${isAudioOn ? "bg-gray-700/90 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}>
					{isAudioOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
				</button>
				<button onClick={toggleVideo}
					className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${isVideoOn ? "bg-gray-700/90 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}>
					{isVideoOn ? <FiCamera size={20} /> : <FiCameraOff size={20} />}
				</button>
				<button onClick={handleEndCall} className="px-5 sm:px-7 py-3 sm:py-3.5 bg-red-600 hover:bg-red-700 rounded-full font-semibold shadow-lg flex items-center gap-2 transition">
					<FiPhoneCall size={18} />
					<span className="text-sm hidden sm:inline">End Call</span>
				</button>
				<button onClick={() => setShowSettings(s => !s)}
					className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${showSettings ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700/90 hover:bg-gray-600"}`}>
					<FiSettings size={20} />
				</button>
			</div>

			{!controlsVisible && (
				<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 md:hidden">
					<p className="text-white/30 text-xs">Tap to show controls</p>
				</div>
			)}

			{showEndCallNotification && <EndCallOverlay />}
		</div>
	);
}
