import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { Camera, Upload } from "lucide-react";
import pako from "pako";
import jsQR from "jsqr";

export default function ContactPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { identityManager } = useUser();

    const editMode         = location.state?.editMode || false;
    const originalUserName = location.state?.originalUserName || null;
    const existingContact  = location.state?.contact || null;

    const [userName, setUserName]           = useState("");
    const [publicKey, setPublicKey]         = useState("");
    const [signalingURLs, setSignalingURLs] = useState([""]);
    const [message, setMessage]             = useState("");
    const [messageType, setMessageType]     = useState("");
    const [scannerActive, setScannerActive] = useState(false);
    const [uploading, setUploading]         = useState(false);

    const videoRef       = useRef(null);
    const streamRef      = useRef(null);
    const animFrameRef   = useRef(null);
    const canvasScanRef  = useRef(document.createElement("canvas"));

    useEffect(() => {
        if (editMode && existingContact) {
            setUserName(existingContact.userName || "");
            setPublicKey(existingContact.publicKey || "");
            const servers = existingContact.signallingServers || [];
            setSignalingURLs(servers.length ? servers : [""]);
        }
    }, [editMode, existingContact]);

    useEffect(() => {
        if (!identityManager) { navigate("/login"); return; }
        return () => stopScanner();
    }, [identityManager, navigate]);

    if (!identityManager) return null;

    /* ── QR parsing ──────────────────────────────────────────────────── */
    const parseQRData = (qrText) => {
        try {
            const json = pako.inflate(
                Uint8Array.from(atob(qrText), c => c.charCodeAt(0)),
                { to: "string" }
            );
            return JSON.parse(json);
        } catch { /* not compressed */ }

        try { return JSON.parse(qrText); } catch { /* not JSON */ }

        return { publicKey: qrText };
    };

    const applyQRData = (data) => {
        console.log("QR Parsed:", data);
        const name = data.n ?? data.userName ?? data.username ?? "";
        if (name) setUserName(name);

        const pk = data.k ?? data.publicKey ?? data.public_key ?? "";
        if (pk) setPublicKey(pk);

        const rawServers = data.s ?? data.signallingServers ?? data.signalingServers ?? [];
        if (Array.isArray(rawServers) && rawServers.length > 0) {
            const normalized = rawServers
                .map(s => (typeof s === "string" ? s : s?.url))
                .filter(Boolean);
            if (normalized.length > 0) setSignalingURLs(normalized);
        }
    };

    /* ── Camera scanner (native getUserMedia + jsQR) ─────────────────── */
    const stopScanner = () => {
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setScannerActive(false);
    };

    const tickScan = () => {
        const video  = videoRef.current;
        const canvas = canvasScanRef.current;
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            animFrameRef.current = requestAnimationFrame(tickScan);
            return;
        }

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code?.data) {
            console.log("Camera QR decoded:", code.data);
            const parsed = parseQRData(code.data.trim());
            applyQRData(parsed);
            stopScanner();
            return;
        }

        animFrameRef.current = requestAnimationFrame(tickScan);
    };

    const startScanner = async () => {
        if (scannerActive) { stopScanner(); return; }

        try {
            const constraints = {
                video: {
                    facingMode: { ideal: "environment" }, // back camera
                    width:  { ideal: 1280 },
                    height: { ideal: 720 },
                },
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            const video = videoRef.current;
            video.srcObject = stream;
            await video.play();

            setScannerActive(true);
            animFrameRef.current = requestAnimationFrame(tickScan);
        } catch (err) {
            console.error("Camera error:", err);
            alert("Camera access failed: " + err.message);
            stopScanner();
        }
    };

    /* ── File upload ─────────────────────────────────────────────────── */
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = "";

        setUploading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob        = new Blob([arrayBuffer], { type: file.type });
            const url         = URL.createObjectURL(blob);

            const img = await new Promise((resolve, reject) => {
                const image  = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("Image load failed"));
                image.src = url;
            });

            const canvas = document.createElement("canvas");
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Try normal, then inverted
            const code =
                jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) ??
                jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "onlyInvert" });

            if (code?.data) {
                console.log("File QR decoded:", code.data);
                const parsed = parseQRData(code.data.trim());
                applyQRData(parsed);
                setMessage("QR code scanned successfully!");
                setMessageType("success");
            } else {
                setMessage("Could not read QR code. Try a clearer, higher-contrast image.");
                setMessageType("error");
            }
        } catch (err) {
            console.error("File upload error:", err);
            setMessage("Failed to process image: " + err.message);
            setMessageType("error");
        } finally {
            setUploading(false);
        }
    };

    /* ── Submit ──────────────────────────────────────────────────────── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userName || !publicKey) {
            setMessage("Username and Public Key are required!");
            setMessageType("error");
            return;
        }
        try {
            const cleanedServers = signalingURLs.map(u => u.trim()).filter(u => u !== "");
            const contact = {
                userName,
                publicKey: publicKey.trim(),
                signallingServers: cleanedServers,
                selectedSignallingServer: cleanedServers[0] ?? null,
            };

            if (editMode) {
                await identityManager.updateContact(originalUserName, contact);
                for (const url of cleanedServers) await identityManager.addSignallingServer(url);
                setMessage("Contact updated successfully!");
                setMessageType("success");
            } else {
                const existing = identityManager.getContacts();
                if (existing.find(c => c.userName === userName)) {
                    setMessage("A contact with this username already exists!");
                    setMessageType("error");
                    return;
                }
                await identityManager.addContact(contact);
                for (const url of cleanedServers) await identityManager.addSignallingServer(url);
                setMessage("Contact added successfully!");
                setMessageType("success");
                setUserName(""); setPublicKey(""); setSignalingURLs([""]);
            }
            setTimeout(() => navigate("/"), 1500);
        } catch (err) {
            console.error(err);
            setMessage((editMode ? "Failed to update: " : "Failed to add: ") + err.message);
            setMessageType("error");
        }
    };

    /* ── UI ──────────────────────────────────────────────────────────── */
    return (
        <div className="w-full min-h-screen flex flex-col">
            <Navbar
                onHomeClick={() => navigate("/")}
                onProfileClick={() => navigate("/profile")}
                onServerClick={() => navigate("/server")}
            />
            <main className="p-4 sm:p-6 flex-1 max-w-md mx-auto">
                <h2 className="text-2xl font-semibold mb-4">
                    {editMode ? "Edit Contact" : "Add New Contact"}
                </h2>

                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    {/* USERNAME */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contact Username *
                        </label>
                        <input
                            type="text"
                            placeholder="Enter contact username"
                            className="w-full border border-gray-300 p-2 rounded"
                            value={userName}
                            onChange={e => setUserName(e.target.value)}
                            disabled={editMode}
                        />
                    </div>

                    {/* PUBLIC KEY */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contact Public Key *
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Enter public key"
                                className="flex-1 border border-gray-300 p-2 rounded"
                                value={publicKey}
                                onChange={e => setPublicKey(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={startScanner}
                                className={`p-2 border rounded ${scannerActive ? "bg-red-100 border-red-400" : ""}`}
                                title={scannerActive ? "Stop scanner" : "Scan QR"}
                            >
                                <Camera size={20} />
                            </button>
                            <label title="Upload QR image" className={uploading ? "opacity-50 pointer-events-none" : ""}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                                <div className="p-2 border rounded cursor-pointer hover:bg-gray-50">
                                    {uploading ? "⏳" : <Upload size={20} />}
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* CAMERA PREVIEW — now uses a real ref */}
                    <video
                        ref={videoRef}
                        className={`w-full h-72 border rounded bg-black ${scannerActive ? "block" : "hidden"}`}
                        muted
                        playsInline
                    />

                    {/* SIGNALING SERVERS */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Signalling Servers
                        </label>
                        <div className="flex flex-col gap-2">
                            {signalingURLs.map((url, i) => (
                                <div key={i} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="wss://server.example.com"
                                        className="flex-1 border border-gray-300 p-2 rounded"
                                        value={url}
                                        onChange={e => {
                                            const updated = [...signalingURLs];
                                            updated[i] = e.target.value;
                                            setSignalingURLs(updated);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = signalingURLs.filter((_, idx) => idx !== i);
                                            setSignalingURLs(updated.length ? updated : [""]);
                                        }}
                                        className="px-4 bg-red-500 text-white rounded"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSignalingURLs([...signalingURLs, ""])}
                            className="mt-2 px-3 py-2 bg-gray-200 rounded text-sm"
                        >
                            + Add Server
                        </button>
                    </div>

                    {/* BUTTONS */}
                    <div className="flex gap-2">
                        <button type="submit" className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                            {editMode ? "Update Contact" : "Add Contact"}
                        </button>
                        <button type="button" onClick={() => navigate("/")} className="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                            Cancel
                        </button>
                    </div>
                </form>

                {message && (
                    <div className={`mt-4 p-3 rounded text-sm ${
                        messageType === "success"
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                    }`}>
                        {message}
                    </div>
                )}
            </main>
        </div>
    );
}