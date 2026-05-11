import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";
import {
  arrayBufferToBase64, base64ToArrayBuffer, decryptAES,
  deriveSharedSecret, encryptAES, generateECDHKeys, importAESKey,
  importECDSAPrivateKey, importECDSAPublicKey, signChallenge, verifyChallenge,
} from "../utils/crypto";
import ConnectionTester from "../utils/ConnectionTester";
import { getIceServersConfig } from "../utils/meterredTurnServer";
import { FiCamera, FiCameraOff, FiMic, FiMicOff, FiPhoneCall, FiSettings } from "react-icons/fi";

const RESOLUTIONS = {
  low:    { width: 640,  height: 480,  label: "SD (480p)"       },
  medium: { width: 1280, height: 720,  label: "HD (720p)"       },
  high:   { width: 1920, height: 1080, label: "Full HD (1080p)" },
};

function toHttpKey(url) {
  if (!url) return url;
  return url
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/$/, "");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatsPanel({ liveStats }) {
  return (
    <div className="bg-black/80 backdrop-blur rounded-lg text-green-300 font-mono text-xs p-3 space-y-0.5">
      <div>⬇ {liveStats.downloadBitrate} kBps</div>
      <div>⬆ {liveStats.uploadBitrate} kBps</div>
      <div>📶 {liveStats.rtt ? `${liveStats.rtt} ms` : "N/A"}</div>
      <div>Jitter: {liveStats.jitter ? `${(liveStats.jitter * 1000).toFixed(1)} ms` : "—"}</div>
      <div>Lost: {liveStats.packetsLost ?? "—"}</div>
      <div>In FPS: {liveStats.inboundFPS ?? "—"}</div>
      <div>Out FPS: {liveStats.outboundFPS ?? "—"}</div>
      <div>In Res: {liveStats.inboundResolutionWidth && liveStats.inboundResolutionHeight
        ? `${liveStats.inboundResolutionWidth}×${liveStats.inboundResolutionHeight}` : "—"}</div>
      <div>Out Res: {liveStats.outboundResolutionWidth && liveStats.outboundResolutionHeight
        ? `${liveStats.outboundResolutionWidth}×${liveStats.outboundResolutionHeight}` : "—"}</div>
    </div>
  );
}

function SettingsPanel({ resolution, onResolutionChange }) {
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl p-4 w-56">
      <h3 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Video Quality</h3>
      <div className="space-y-1.5">
        {Object.entries(RESOLUTIONS).map(([key, value]) => (
          <button key={key} onClick={() => onResolutionChange(key)}
            className={`w-full px-3 py-2 rounded-lg text-left text-xs transition ${
              resolution === key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}>
            <div className="font-medium">{value.label}</div>
            <div className="opacity-60">{value.width} × {value.height}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-700">Higher quality uses more bandwidth.</p>
    </div>
  );
}

function EndCallOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-red-500 text-white px-8 py-6 rounded-2xl shadow-2xl text-center">
        <div className="text-4xl mb-3 text-red-400"><FiPhoneCall /></div>
        <div className="text-lg font-semibold">Call Ended</div>
        <div className="text-sm text-gray-400 mt-1">Remote user ended the call</div>
        <div className="text-xs text-gray-500 mt-3 animate-pulse">Redirecting…</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CallPage() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { identityManager, getSocket } = useUser();

  const contact          = location.state?.contact;
  const signallingServer = location.state?.signallingServer || null;

  const callInitiatedFromHome = Boolean(location.state?.callInitiated);
  const callAlreadyAccepted   = Boolean(location.state?.callAlreadyAccepted);
  const incomingCallAccepted  = Boolean(location.state?.incomingCall);

  // ── Video refs ────────────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);

  // ── WebRTC / signalling refs ──────────────────────────────────────────────
  const pcRef                = useRef(null);
  const wsRef                = useRef(null);
  const pendingCandidates    = useRef([]);
  const pendingIceCandidates = useRef([]);
  const ECDHKeyPair          = useRef(null);
  const AESKey               = useRef(null);
  const callTimeoutRef       = useRef(null);
  const controlsTimerRef     = useRef(null);
  const pingIntervalRef      = useRef(null);   // ← keepalive handle

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isVideoOn,               setIsVideoOn]               = useState(true);
  const [isAudioOn,               setIsAudioOn]               = useState(true);
  const [error,                   setError]                   = useState(null);
  const [showError,               setShowError]               = useState(false);
  const [showEndCallNotification, setShowEndCallNotification] = useState(false);
  const [showSettings,            setShowSettings]            = useState(false);
  const [showStats,               setShowStats]               = useState(false);
  const [resolution,              setResolution]              = useState("medium");
  const [hasRemoteStream,         setHasRemoteStream]         = useState(false);
  const [controlsVisible,         setControlsVisible]         = useState(true);
  const [signalingLost,           setSignalingLost]           = useState(false); // ← new
  const [liveStats,               setLiveStats]               = useState({
    downloadBitrate: 0, uploadBitrate: 0, jitter: 0, packetsLost: 0, rtt: "N/A",
    inboundFPS: 0, inboundResolutionWidth: 0, inboundResolutionHeight: 0,
    outboundFPS: 0, outboundResolutionWidth: 0, outboundResolutionHeight: 0,
  });

  const myPublicKey = identityManager?.getPublicKey();

  // ── Controls auto-hide ────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
  }, []);

  useEffect(() => {
    showControls();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [showControls]);

  useEffect(() => {
    if (error) {
      setShowError(true);
      const t = setTimeout(() => setShowError(false), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Media helpers ─────────────────────────────────────────────────────────
  const requestMediaStream = async (resKey) => {
    try {
      const res = RESOLUTIONS[resKey];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: res.width }, height: { ideal: res.height } },
        audio: true,
      });
      return { stream, error: null };
    } catch (err) {
      console.error("Media Device Error:", err);
      return { stream: null, error: "Unable to access camera/microphone." };
    }
  };

  const cleanupMedia = useCallback(() => {
    // Stop keepalive ping
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach(t => t.stop());
    remoteStreamRef.current = null;
    if (pcRef.current) {
      pcRef.current._tester?.stop();
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
    navigate("/");
  }, [cleanupMedia, navigate]);

  const handleEndCall = useCallback(() => {
    if (wsRef.current?.isOpen()) {
      wsRef.current.send({
        type: "end-call",
        from: myPublicKey,
        to:   contact.publicKey,
      });
    }
    endCallAndNavigate();
  }, [myPublicKey, contact, endCallAndNavigate]);

  // ── Signalling helpers ────────────────────────────────────────────────────
  async function sendCandidate(candidate) {
    if (!AESKey.current) { pendingIceCandidates.current.push(candidate); return; }
    const buf = new TextEncoder().encode(JSON.stringify(candidate));
    const { iv, encrypted } = await encryptAES(buf, AESKey.current);
    wsRef.current.send({
      type:      "ice",
      candidate: arrayBufferToBase64(encrypted),
      iv:        arrayBufferToBase64(iv),
      from:      myPublicKey,
      to:        contact.publicKey,
    });
  }

  function startHandshake() {
    wsRef.current.send({ type: "join", from: myPublicKey, to: contact.publicKey });
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const unsubscribers = [];

    if (!identityManager || !contact || !signallingServer) {
      if (!identityManager || !contact) navigate("/login");
      return;
    }

    const init = async () => {
      // 1. Media
      const { stream, error: streamError } = await requestMediaStream("medium");
      if (!active) return;
      if (streamError) { setError(streamError); return; }

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2. ICE config
      let manualTurnServers = [];
      try { manualTurnServers = identityManager.getTurnServers(); } catch {}

      const iceServersConfig = await getIceServersConfig(manualTurnServers);
      const customStun = localStorage.getItem("activeStun") || "stun:stun.l.google.com:19302";
      iceServersConfig.iceServers.unshift({ urls: [customStun] });

      // 3. PeerConnection
      const pc = new RTCPeerConnection(iceServersConfig);
      pcRef.current = pc;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (event) => {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        remoteStreamRef.current.addTrack(event.track);
        setHasRemoteStream(true);
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[CallPage] ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          const tester = new ConnectionTester(pc, (stats) => {
            setLiveStats({
              downloadBitrate:         (Math.round(stats.downloadBitrate || 0) / 8000).toFixed(1),
              uploadBitrate:           (Math.round(stats.uploadBitrate   || 0) / 8000).toFixed(1),
              jitter:                  stats.jitter?.toFixed(3),
              packetsLost:             stats.packetsLost,
              rtt:                     stats.rtt ? stats.rtt.toFixed(1) : null,
              inboundFPS:              stats.inboundFPS              ?? null,
              inboundResolutionWidth:  stats.inboundResolutionWidth  ?? null,
              inboundResolutionHeight: stats.inboundResolutionHeight ?? null,
              outboundFPS:             stats.outboundFPS             ?? null,
              outboundResolutionWidth:  stats.outboundResolutionWidth  ?? null,
              outboundResolutionHeight: stats.outboundResolutionHeight ?? null,
            });
          });
          console.log("Call established at", Date.now());
          tester.start(1000);
          pcRef.current._tester = tester;
        }
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          console.warn("[CallPage] ICE connection", pc.iceConnectionState);
          setError(`Peer connection ${pc.iceConnectionState}. Network issue?`);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) sendCandidate(event.candidate);
      };

      // 4. ECDH keypair
      ECDHKeyPair.current = await generateECDHKeys();

      // 5. Get socket
      const socketKey = toHttpKey(signallingServer);
      console.log("[CallPage] Looking up socket with key:", socketKey);
      const sm = getSocket(socketKey);

      if (!sm) {
        console.error("[CallPage] Socket not found for key:", socketKey);
        setError("Lost connection to signalling server. Please go back and try again.");
        return;
      }

      wsRef.current = sm;
      console.log("[CallPage] Socket found, isOpen:", sm.isOpen());

      // 6. Detect WebSocket close mid-call and surface it to the user
      const underlyingWs = sm.getSocket?.();
      if (underlyingWs) {
        const prevOnClose = underlyingWs.onclose;
        underlyingWs.onclose = (event) => {
          prevOnClose?.(event);
          if (active) {
            console.error("[CallPage] WebSocket closed mid-call:", event.code, event.reason);
            setSignalingLost(true);
            setError("Signalling server connection lost. The call may continue over P2P.");
          }
        };
      }

      // 7. Keepalive ping — prevents idle timeout on Render.com / cloud servers
      pingIntervalRef.current = setInterval(() => {
        if (sm.isOpen()) sm.send({ type: "ping", from: myPublicKey });
      }, 25_000);

      // 8. Subscribe to signalling messages
      unsubscribers.push(sm.subscribe("join", async () => {
        console.log("[CallPage] Received join — sending challenge1");
        const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
        const privKey   = await importECDSAPrivateKey(identityManager.getPrivateKey());
        const signature = await signChallenge(privKey, rawPubKey);
        sm.send({
          type:      "challenge1",
          publicKey: arrayBufferToBase64(rawPubKey),
          signature: arrayBufferToBase64(signature),
          from:      myPublicKey,
          to:        contact.publicKey,
        });
      }));

      unsubscribers.push(sm.subscribe("challenge1", async (data) => {
        console.log("[CallPage] Received challenge1");
        const rawECDH       = base64ToArrayBuffer(data.publicKey);
        const signature     = base64ToArrayBuffer(data.signature);
        const contactPubKey = await importECDSAPublicKey(contact.publicKey);

        const valid = await verifyChallenge(contactPubKey, rawECDH, signature);
        if (!valid) { console.error("[CallPage] Invalid signature in challenge1"); return; }

        const rawPubKey = await crypto.subtle.exportKey("raw", ECDHKeyPair.current.publicKey);
        const privKey   = await importECDSAPrivateKey(identityManager.getPrivateKey());
        const sig       = await signChallenge(privKey, rawPubKey);
        sm.send({
          type:      "challenge2",
          publicKey: arrayBufferToBase64(rawPubKey),
          signature: arrayBufferToBase64(sig),
          from:      myPublicKey,
          to:        contact.publicKey,
        });

        const ecdhPub      = await crypto.subtle.importKey("raw", rawECDH, { name: "ECDH", namedCurve: "P-256" }, true, []);
        const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, ecdhPub);
        AESKey.current     = await importAESKey(sharedSecret);

        for (const c of pendingIceCandidates.current) await sendCandidate(c);
        pendingIceCandidates.current = [];
      }));

      unsubscribers.push(sm.subscribe("challenge2", async (data) => {
        console.log("[CallPage] Received challenge2 — creating offer");
        const rawECDH       = base64ToArrayBuffer(data.publicKey);
        const signature     = base64ToArrayBuffer(data.signature);
        const contactPubKey = await importECDSAPublicKey(contact.publicKey);

        const valid = await verifyChallenge(contactPubKey, rawECDH, signature);
        if (!valid) { console.error("[CallPage] Invalid signature in challenge2"); return; }

        const ecdhPub      = await crypto.subtle.importKey("raw", rawECDH, { name: "ECDH", namedCurve: "P-256" }, true, []);
        const sharedSecret = await deriveSharedSecret(ECDHKeyPair.current.privateKey, ecdhPub);
        AESKey.current     = await importAESKey(sharedSecret);

        for (const c of pendingIceCandidates.current) await sendCandidate(c);
        pendingIceCandidates.current = [];

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdpBuf = new TextEncoder().encode(offer.sdp);
        const { iv, encrypted } = await encryptAES(sdpBuf, AESKey.current);
        sm.send({
          type:  "offer",
          offer: arrayBufferToBase64(encrypted),
          iv:    arrayBufferToBase64(iv),
          from:  myPublicKey,
          to:    contact.publicKey,
        });
      }));

      unsubscribers.push(sm.subscribe("offer", async (data) => {
        console.log("[CallPage] Received offer");
        const iv     = base64ToArrayBuffer(data.iv);
        const encSDP = base64ToArrayBuffer(data.offer);
        const sdpBuf = await decryptAES(encSDP, AESKey.current, iv);
        const sdp    = new TextDecoder().decode(sdpBuf);
        await pc.setRemoteDescription({ type: "offer", sdp });

        for (const c of pendingCandidates.current) {
          try { await pc.addIceCandidate(c); } catch (e) { console.error("[CallPage] ICE error", e); }
        }
        pendingCandidates.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const ansBuf = new TextEncoder().encode(answer.sdp);
        const { iv: ansIv, encrypted: encAns } = await encryptAES(ansBuf, AESKey.current);
        sm.send({
          type:   "answer",
          answer: arrayBufferToBase64(encAns),
          iv:     arrayBufferToBase64(ansIv),
          from:   myPublicKey,
          to:     contact.publicKey,
        });
      }));

      unsubscribers.push(sm.subscribe("answer", async (data) => {
        console.log("[CallPage] Received answer");
        const iv     = base64ToArrayBuffer(data.iv);
        const encSDP = base64ToArrayBuffer(data.answer);
        const sdpBuf = await decryptAES(encSDP, AESKey.current, iv);
        const sdp    = new TextDecoder().decode(sdpBuf);
        await pc.setRemoteDescription({ type: "answer", sdp });

        for (const c of pendingCandidates.current) {
          try { await pc.addIceCandidate(c); } catch (e) { console.error("[CallPage] ICE error", e); }
        }
        pendingCandidates.current = [];
      }));

      unsubscribers.push(sm.subscribe("ice", async (data) => {
        if (!AESKey.current) {
          console.warn("[CallPage] ICE received before AES key ready — queuing");
          return;
        }
        const iv        = base64ToArrayBuffer(data.iv);
        const encBuf    = base64ToArrayBuffer(data.candidate);
        const candBuf   = await decryptAES(encBuf, AESKey.current, iv);
        const candidate = new RTCIceCandidate(JSON.parse(new TextDecoder().decode(candBuf)));

        if (!pc.currentRemoteDescription) {
          pendingCandidates.current.push(candidate);
        } else {
          try { await pc.addIceCandidate(candidate); } catch (e) { console.error("[CallPage] ICE error", e); }
        }
      }));

      unsubscribers.push(sm.subscribe("end-call", () => {
        console.log("[CallPage] Remote user ended call");
        setShowEndCallNotification(true);
        setTimeout(() => endCallAndNavigate(), 2500);
      }));

      // 9. Start handshake
      // Caller sends "join" after a short delay so callee's CallPage has time
      // to mount and subscribe before the message arrives
      if (callInitiatedFromHome && callAlreadyAccepted) {
        console.log("[CallPage] Caller: starting handshake in 1.5s...");
        setTimeout(() => {
          if (!active) return;
          console.log("[CallPage] Caller: sending join now");
          startHandshake();
        }, 1500);
      }

      if (incomingCallAccepted) {
        console.log("[CallPage] Callee: waiting for join from caller");
      }
    };

    init();

    return () => {
      active = false;
      cleanupMedia();
      unsubscribers.forEach(u => u());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!identityManager) return null;

  // ── Resolution change ─────────────────────────────────────────────────────
  const handleResolutionChange = async (newRes) => {
    setResolution(newRes);
    const { stream: newStream, error: streamError } = await requestMediaStream(newRes);
    if (streamError) { setError(streamError); return; }

    const pc = pcRef.current;
    if (pc && localStreamRef.current) {
      const oldVideo = localStreamRef.current.getVideoTracks()[0];
      const newVideo = newStream.getVideoTracks()[0];
      const sender   = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender && newVideo) await sender.replaceTrack(newVideo);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([
          ...localVideoRef.current.srcObject.getTracks().filter(t => t.kind !== "video"),
          newVideo,
        ]);
      }
      oldVideo.stop();
      localStreamRef.current = new MediaStream([newVideo, localStreamRef.current.getAudioTracks()[0]]);
    } else {
      localStreamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      if (pc) newStream.getTracks().forEach(t => pc.addTrack(t, newStream));
    }
    setShowSettings(false);
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsVideoOn(track.enabled); }
  };

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsAudioOn(track.enabled); }
  };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden" onClick={showControls}>
      <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-contain" />

      {!hasRemoteStream && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-400 text-base">Waiting for {contact?.userName}…</p>
        </div>
      )}

      {/* Signalling lost banner — non-fatal, P2P may still be alive */}
      {signalingLost && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-600/90 text-white text-xs text-center py-1.5 px-4">
          ⚠️ Signalling server disconnected — call audio/video may still continue
        </div>
      )}

      {/* Local PiP */}
      <div className="absolute top-3 right-3 w-28 h-20 sm:w-36 sm:h-28 lg:w-44 lg:h-32 rounded-xl overflow-hidden border border-gray-600 shadow-2xl z-10">
        <video
          ref={localVideoRef}
          autoPlay playsInline muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!isVideoOn && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <span className="text-3xl">👤</span>
          </div>
        )}
        <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 text-xs rounded text-gray-300">
          {RESOLUTIONS[resolution].label}
        </div>
      </div>

      {/* Stats toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowStats(s => !s); showControls(); }}
        className={`absolute top-3 left-3 z-20 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
          showStats ? "bg-green-700 text-white" : "bg-black/60 text-green-400 hover:bg-black/80"
        }`}
      >
        📊 Stats
      </button>

      {showStats && (
        <div className="absolute top-12 left-3 z-20 max-w-xs" onClick={e => e.stopPropagation()}>
          <StatsPanel liveStats={liveStats} />
        </div>
      )}

      {showError && error && (
        <div className="absolute top-14 left-3 z-20 bg-red-700/90 text-white px-4 py-2 rounded-lg text-sm shadow-lg max-w-xs">
          {error}
        </div>
      )}

      {showSettings && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30" onClick={e => e.stopPropagation()}>
          <SettingsPanel resolution={resolution} onResolutionChange={handleResolutionChange} />
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 sm:gap-4 px-4 py-4 sm:py-5 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 md:opacity-100 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={toggleAudio}
          className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${isAudioOn ? "bg-gray-700/90 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}
        >
          {isAudioOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
        </button>
        <button
          onClick={toggleVideo}
          className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${isVideoOn ? "bg-gray-700/90 hover:bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}
        >
          {isVideoOn ? <FiCamera size={20} /> : <FiCameraOff size={20} />}
        </button>
        <button
          onClick={handleEndCall}
          className="px-5 sm:px-7 py-3 sm:py-3.5 bg-red-600 hover:bg-red-700 rounded-full font-semibold shadow-lg flex items-center gap-2 transition"
        >
          <FiPhoneCall size={18} />
          <span className="text-sm hidden sm:inline">End Call</span>
        </button>
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`p-3 sm:p-3.5 rounded-full transition shadow-lg ${showSettings ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700/90 hover:bg-gray-600"}`}
        >
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