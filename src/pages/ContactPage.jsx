import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Upload } from "lucide-react";

import pako from "pako";

export default function ContactPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { identityManager } = useUser();

    const editMode = location.state?.editMode || false;
    const originalUserName = location.state?.originalUserName || null;
    const existingContact = location.state?.contact || null;

    const [userName, setUserName] = useState("");
    const [publicKey, setPublicKey] = useState("");

    const [signalingURLs, setSignalingURLs] = useState([""]);

    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("");

    const qrScannerRef = useRef(null);

    useEffect(() => {
        if (editMode && existingContact) {

            setUserName(existingContact.userName || "");

            setPublicKey(existingContact.publicKey || "");

            const servers = existingContact.signallingServers;
            setSignalingURLs(servers.length ? servers : [""]);
        }
    }, [editMode, existingContact]);


    const parseQRData = (qrText) => {
        try {
            const json = pako.inflate(
                Uint8Array.from(atob(qrText), c => c.charCodeAt(0)),
                { to: "string" }
            );

            return JSON.parse(json);

        } catch (e) {
            try {
                return JSON.parse(qrText);
            } catch {
                return {
                    publicKey: qrText
                };
            }
        }
    };

    const applyQRData = (data) => {
        console.log("QR Parsed:", data);

        if (data.n || data.userName) {
            setUserName(data.n || data.userName);
        }

        if (data.k || data.publicKey) {
            setPublicKey(data.k || data.publicKey);
        }

        if (data.s || data.signalingServers) {
            let servers = data.s || data.signalingServers;

            if (Array.isArray(servers)) {

                const normalized = servers.map(s =>
                    typeof s === "string" ? s : s.url
                ).filter(Boolean);

                if (normalized.length > 0) {
                    setSignalingURLs(normalized);
                }
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userName || !publicKey) {
            setMessage("Username and Public Key are required!");
            setMessageType("error");
            return;
        }

        try {
            const cleanedServers = signalingURLs
                .map(url => url.trim())
                .filter(url => url !== "");

            const contact = {
                userName,
                publicKey: publicKey.trim(),
                signallingServers: cleanedServers,
				selectedSignallingServer: cleanedServers.length > 0 ? cleanedServers[0] : null,
            };

            if (editMode) {

                await identityManager.updateContact(
                    originalUserName,
                    contact
                );

                for (const url of cleanedServers) {
                    await identityManager.addSignallingServer(
                        url,
                        false
                    );
                }

                setMessage("Contact updated successfully!");
                setMessageType("success");

            } else {
                console.log("Adding new contact");
                
                const existingContacts = identityManager.getContacts();

                const duplicate = existingContacts.find(
                    c => c.userName === userName
                );

                if (duplicate) {
                    setMessage(
                        "Contact with this username already exists!"
                    );
                    setMessageType("error");
                    return;
                }

                await identityManager.addContact(
                    contact
                );

                console.log("Contact added successfully");

                // ADD TO GLOBAL SIGNALING SERVER LIST
                for (const url of cleanedServers) {
                    await identityManager.addSignallingServer(
                        url,
                        false
                    );
                }

                setMessage("Contact added successfully!");
                setMessageType("success");

                setUserName("");
                setPublicKey("");
                setSignalingURLs([""]);
            }

            setTimeout(() => {
                navigate("/");
            }, 1500);

        } catch (err) {
            console.error(err);

            setMessage(
                editMode
                    ? "Failed to update contact: " + err.message
                    : "Failed to add contact: " + err.message
            );

            setMessageType("error");
        }
    };

    const controlsRef = useRef(null);

    const startScanner = async () => {
        if (qrScannerRef.current) return;

        const reader = new BrowserMultiFormatReader();
        qrScannerRef.current = reader;

        try {
            const videoElement = document.getElementById("qr-reader");

            const devices = await BrowserMultiFormatReader.listVideoInputDevices();

            const backCamera =
                devices.find(d => d.label.toLowerCase().includes("back")) ||
                devices[0];

            controlsRef.current = await reader.decodeFromVideoDevice(
                backCamera?.deviceId,
                videoElement,
                (result, err) => {
                    if (result) {
                        const text = result.getText().trim();

                        const parsed = parseQRData(text);

                        applyQRData(parsed);
                        controlsRef.current?.stop();
                        qrScannerRef.current = null;
                        controlsRef.current = null;
                    }
                }
            );

        } catch (err) {
            console.error(err);
            alert("Camera access failed");
            qrScannerRef.current = null;
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const reader = new BrowserMultiFormatReader();

            const result = await reader.decodeFromImageUrl(
                URL.createObjectURL(file)
            );

            const text = result.getText().trim();

            const parsed = parseQRData(text);

            applyQRData(parsed);

        } catch (err) {
            console.error(err);
            alert("Invalid QR code image");
        }
    };

    const handleCancel = () => {
        navigate("/");
    };

    useEffect(() => {
        if (!identityManager) {
            navigate("/login");
            return;
        }

        return () => {
            controlsRef.current?.stop();
            qrScannerRef.current = null;
            controlsRef.current = null;
        };
    }, [identityManager, navigate]);

	if(!identityManager) return null;

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

                <form
                    className="flex flex-col gap-4"
                    onSubmit={handleSubmit}
                >

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
                            onChange={(e) =>
                                setUserName(e.target.value)
                            }
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
                                onChange={(e) =>
                                    setPublicKey(e.target.value)
                                }
                            />

                            <button
                                type="button"
                                onClick={startScanner}
                                className="p-2 border rounded"
                            >
                                <Camera size={20} />
                            </button>

                            <label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />

                                <div className="p-2 border rounded cursor-pointer">
                                    <Upload size={20} />
                                </div>
                            </label>

                        </div>

                    </div>

                    {/* CAMERA */}
                    <video
                        id="qr-reader"
                        className="w-full h-72 border rounded bg-black"
                    />

                    {/* MULTIPLE SIGNALING SERVERS */}
                    <div>

                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Signaling Servers
                        </label>

                        <div className="flex flex-col gap-2">

                            {signalingURLs.map((url, index) => (

                                <div
                                    key={index}
                                    className="flex gap-2"
                                >

                                    <input
                                        type="text"
                                        placeholder="wss://server.example.com"
                                        className="flex-1 border border-gray-300 p-2 rounded"
                                        value={url}
                                        onChange={(e) => {

                                            const updated =
                                                [...signalingURLs];

                                            updated[index] =
                                                e.target.value;

                                            setSignalingURLs(updated);
                                        }}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => {

                                            const updated =
                                                signalingURLs.filter(
                                                    (_, i) => i !== index
                                                );

                                            setSignalingURLs(
                                                updated.length
                                                    ? updated
                                                    : [""]
                                            );
                                        }}
                                        className="px-4 bg-red-500 text-white rounded"
                                    >
                                        X
                                    </button>

                                </div>

                            ))}

                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setSignalingURLs([
                                    ...signalingURLs,
                                    ""
                                ])
                            }
                            className="mt-2 px-3 py-2 bg-gray-200 rounded"
                        >
                            + Add Server
                        </button>

                    </div>

                    {/* BUTTONS */}
                    <div className="flex gap-2">

                        <button
                            type="submit"
                            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded"
                        >
                            {editMode
                                ? "Update Contact"
                                : "Add Contact"}
                        </button>

                        <button
                            type="button"
                            onClick={handleCancel}
                            className="flex-1 bg-gray-300 px-4 py-2 rounded"
                        >
                            Cancel
                        </button>

                    </div>

                </form>

                {/* MESSAGE */}
                {message && (
                    <div
                        className={`mt-4 p-3 rounded text-sm ${messageType === "success"
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                            }`}
                    >
                        {message}
                    </div>
                )}

            </main>

        </div>
    );
}
