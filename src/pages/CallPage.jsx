import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";

// Resolution presets
const RESOLUTIONS = {
	low: { width: 640, height: 480, label: "SD (480p)" },
	medium: { width: 1280, height: 720, label: "HD (720p)" },
	high: { width: 1920, height: 1080, label: "Full HD (1080p)" }
};

export default function CallPage() {
	const localVideoRef = useRef(null);
	const remoteVideoRef = useRef(null);

	const [localStream, setLocalStream] = useState(null);
	const [remoteStream, setRemoteStream] = useState(null);
	const [isVideoOn, setIsVideoOn] = useState(true);
	const [isAudioOn, setIsAudioOn] = useState(true);
	const [error, setError] = useState(null);
	const [showEndCallNotification, setShowEndCallNotification] = useState(false);

	const [showSettings, setShowSettings] = useState(false);
	const [resolution, setResolution] = useState("medium");

	const pcRef = useRef(null);
	const wsRef = useRef(null);
	const pendingCandidates = useRef([]);

	const navigate = useNavigate();
	const {identity} = useUser();

	if (!identity) {
		navigate("/login");
	}

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

	const handleSignalingMessage = async (data) => {
		const message = JSON.parse(data);

		const pc = pcRef.current;

		if (message.type === "offer") {
			console.log("Received offer");
			await pc.setRemoteDescription(new RTCSessionDescription(message.offer));

			// Add queued ICE candidates
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

			wsRef.current.send(
				JSON.stringify({ type: "answer", answer })
			);
		}

		if (message.type === "answer") {
			console.log("Received answer");
			await pc.setRemoteDescription(new RTCSessionDescription(message.answer));

			// Add queued ICE candidates
			for (const c of pendingCandidates.current) {
				try {
					await pc.addIceCandidate(c);
				} catch (e) {
					console.error("Error adding queued ICE candidate", e);
				}
			}
			pendingCandidates.current = [];
		}

		if (message.type === "ice") {
			const candidate = new RTCIceCandidate(message.candidate);

			// Queue ICE candidates if remote description isn't set yet
			if (!pc.currentRemoteDescription) {
				pendingCandidates.current.push(candidate);
			} else {
				try {
					await pc.addIceCandidate(candidate);
				} catch (e) {
					console.error("Eror adding ICE candidate", e);
				}
			}
		}

		// Optional: Automatically create offer if second peer connects
		if (message.type === "join" && !pc.currentRemoteDescription && wsRef.current.readyState === 1) {
			// Only create offer if we don't have remote description yet
			//if (!pc.currentRemoteDescription) {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			wsRef.current.send(
				JSON.stringify({ type: "offer", offer })
			);
			//}
		}

		if (message.type === "end-call") {
			console.log("Remote user ended call");

			setShowEndCallNotification(true);
			setTimeout(() => {
				if (localStream) {
					localStream.getTracks().forEach(track => track.stop());
				}

				if(pcRef.current)
					pcRef.current.close();

				if(wsRef.current)
					wsRef.current.close();

				navigate("/");
				return;
			}, 3000);
			return;
		}
	};


	// --------- INITIAL STARTUP ---------
	useEffect(() => {
		let active = true;

		const init = async () => {
			const { stream, error } = await requestMediaStream("medium");

			if (!active) return;

			if (error) {
				setError(error);
				return;
			}

			// Stop existing stream safely
			if (localStream) {
				localStream.getTracks().forEach(t => t.stop());
			}

			setLocalStream(stream);
			setError(null);

			// Attach to video element
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
				pc.addTrack(track, stream);
			});

			pc.ontrack = (event) => {
				const stream = event.streams[0];
				remoteVideoRef.current.srcObject = stream;
				setRemoteStream(stream);
			};

			//pc.onicecandidate = (event) => {
			//	if (event.candidate) {
			//		setLocalCandidates((prev) => [...prev, event.candidate]);
			//	}
			//};


			//const ws = new WebSocket("wss://192.168.101.4:8080");
			const ws = new WebSocket("ws://localhost:8080");
			wsRef.current = ws;

			ws.onopen = () => console.log("Connected to signaling server");
			ws.onmessage = (msg) => handleSignalingMessage(msg.data);

			// Send ICE candidates to remote peer
			pc.onicecandidate = (event) => {
				if (event.candidate && ws.readyState === 1) {
					ws.send(
						JSON.stringify({ type: "ice", candidate: event.candidate })
					);
				}
			};

		};

		init();

		return () => {
			active = false;

			if(localStream){
				localStream.getTracks().forEach(t => t.stop());
			}

			

			if (pcRef.current) {
				pcRef.current.close();
				pcRef.current = null;

			}
			if (wsRef.current && wsRef.current.readyState === 1) {
				wsRef.current.close();
				wsRef.current = null;
			}

		};
	}, []);



	// -------- RESOLUTION CHANGE ----------
	const handleResolutionChange = async (newRes) => {
		setResolution(newRes);

		const { stream, error } = await requestMediaStream(newRes);

		if (error) {
			setError(error);
			return;
		}

		const pc = pcRef.current;
		if (pc) {
			const videoTrack = stream.getVideoTracks()[0];
			const audioTrack = stream.getAudioTracks()[0];

			const videoSender = pc.getSenders().find(sender => sender.track && sender.track.kind === 'video');
			if (videoSender && videoTrack)
				await videoSender.replaceTrack(videoTrack);

			const audioSender = pc.getSenders().find(sender => sender.track && sender.track.kind == 'audio');
			if (audioSender & audioTrack)
				await audioSender.replaceTrack(audioTrack);
		}


		// stop old stream
		if (localStream) {
			localStream.getTracks().forEach(t => t.stop());
		}

		setLocalStream(stream);
		setShowSettings(false);

		if (localVideoRef.current) {
			localVideoRef.current.srcObject = stream;
		}
	};

	// ----------- TOGGLE VIDEO ----------
	const toggleVideo = () => {
		if (!localStream) return;

		const track = localStream.getVideoTracks()[0];
		if (track) {
			track.enabled = !track.enabled;
			setIsVideoOn(track.enabled);
		}
	};

	// ----------- TOGGLE AUDIO ----------
	const toggleAudio = () => {
		if (!localStream) return;

		const track = localStream.getAudioTracks()[0];
		if (track) {
			track.enabled = !track.enabled;
			setIsAudioOn(track.enabled);
		}
	};

	// ----------- END CALL ----------
	const handleEndCall = () => {
		if (wsRef.current && wsRef.current.readyState === 1) {
			wsRef.current.send(JSON.stringify({ type: "end-call" }));
		}

		if (localStream) {
			localStream.getTracks().forEach(track => track.stop());
		}

		if (pcRef.current)
			pcRef.current.close();

		if (wsRef.current)
			wsRef.current.close();
		navigate("/");
	};

	return (
		<div className="w-full min-h-screen flex flex-col bg-black">
			<div className="flex-1 relative text-white flex items-stretch">

				{/* Remote video */}
				<div className="flex-1 flex items-center justify-center bg-gray-800">
					<video
						ref={remoteVideoRef}
						autoPlay
						playsInline
						className="w-full h-full object-cover"
					/>
					{!remoteStream && (
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
						className="w-full h-full object-cover"
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

					{/* End Call */}
					<button
						onClick={handleEndCall}
						className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium shadow-lg"
					>
						End Call
					</button>

					{/* Controls */}
					<div className="flex gap-3 bg-gray-800 bg-opacity-80 rounded-full p-2 shadow-lg backdrop-blur">

						{/* Audio */}
						<button
							onClick={toggleAudio}
							className={`p-3 rounded-full transition ${isAudioOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"
								}`}
						>
							<span className="text-xl">{isAudioOn ? "🎙️" : "🔇"}</span>
						</button>

						{/* Video */}
						<button
							onClick={toggleVideo}
							className={`p-3 rounded-full transition ${isVideoOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"
								}`}
						>
							<span className="text-xl">{isVideoOn ? "🎥" : "📷"}</span>
						</button>

						{/* Settings */}
						<button
							onClick={() => setShowSettings(!showSettings)}
							className={`p-3 rounded-full ${showSettings ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
								}`}
						>
							<span className="text-xl">⚙️</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
