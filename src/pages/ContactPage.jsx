import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { importECDSAPublicKey } from "../utils/crypto.js";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Upload } from "lucide-react";

export default function ContactPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { identityManager } = useUser();

    const editMode = location.state?.editMode || false;
    const originalUserName = location.state?.originalUserName || null;
    const existingContact = location.state?.contact || null;

    const [userName, setUserName] = useState("");
    const [publicKey, setPublicKey] = useState("");
    const [signalingURL, setSignalingURL] = useState("");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState(""); // "success" or "error"

    const qrRegionId = "qr-reader";
    const qrScannerRef = useRef(null);

    // Load existing contact data if in edit mode
    useEffect(() => {
        if (editMode && existingContact) {
            console.log("ContactPage - Edit Mode Activated");
            console.log("Existing contact data:", existingContact);
            
            setUserName(existingContact.userName || "");
            
            // Handle public key - should be a string now
            if (existingContact.publicKey) {
                console.log("Public key type:", typeof existingContact.publicKey);
                console.log("Public key (first 50 chars):", 
                    typeof existingContact.publicKey === 'string' 
                        ? existingContact.publicKey.substring(0, 50)
                        : "[object Object]"
                );
                setPublicKey(existingContact.publicKey || "");
            }
            
            setSignalingURL(existingContact.signalingServerURL || "");
        } else {
            console.log("ContactPage - Add Mode (New Contact)");
        }
    }, [editMode, existingContact]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userName || !publicKey) {
            setMessage("Username and Public Key are required!");
            setMessageType("error");
            return;
        }

        try {
            console.log("Submitting form...");
            console.log("Public key (first 50 chars):", publicKey.substring(0, 50));
            
            // Import public key from base64 string to CryptoKey
            const importedKey = await importECDSAPublicKey(publicKey.trim());
            console.log("Public key imported successfully");

            if (editMode) {
                
                const contact = {
                    userName,
                    publicKey: importedKey,  
                    signalingServerURL: signalingURL || null,
                };

            
                await identityManager.updateContact(
                    originalUserName,
                    contact
                );
                console.log("Contact updated in IdentityManager");

               
                //if (originalUserName !== userName) {
                //    console.log("Username changed, recreating contact entry");
                //   
                //    await identityManager.deleteContact(identityManager.userName, originalUserName);
                //    await identityManager.addContact(identityManager.userName, contact);
                //}

              
                if (signalingURL) {
                    await identityManager.addSignallingServer(
                        signalingURL,
                    );
                }

                setMessage("Contact updated successfully!");
                setMessageType("success");

                setTimeout(() => {
                    navigate("/");
                }, 1500);
            } else {
                console.log("Adding new contact");
                
                const existingContacts = identityManager.getContacts();

                const duplicate = existingContacts.find(
                    (c) => c.userName === userName
                );

                if (duplicate) {
                    setMessage("Contact with this username already exists!");
                    setMessageType("error");
                    return;
                }

                const contact = {
                    userName,
                    publicKey: importedKey,  
                    signalingServerURL: signalingURL || null,
                };

                await identityManager.addContact(contact);
                console.log("Contact added successfully");

                if (signalingURL) {
                    await identityManager.addSignallingServer(
                        signalingURL,
                    );
                }

                setMessage("Contact added successfully!");
                setMessageType("success");

                setUserName("");
                setPublicKey("");
                setSignalingURL("");

                setTimeout(() => {
                    navigate("/");
                }, 1500);
            }
        } catch (err) {
            console.error("Error during submit:", err);
            setMessage(
                editMode 
                    ? "Failed to update contact: " + err.message
                    : "Failed to add contact: " + err.message
            );
            setMessageType("error");
        }
    };

    const startScanner = async () => {
        if (qrScannerRef.current) return;

        const scanner = new Html5Qrcode(qrRegionId);
        qrScannerRef.current = scanner;

        try {
            await scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (decodedText) => {
                    console.log("QR code scanned");
                    setPublicKey(decodedText.trim());
                    scanner.stop();
                    qrScannerRef.current = null;
                }
            );
        } catch (err) {
            console.error(err);
            alert("Unable to access camera");
            qrScannerRef.current = null;
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const scanner = new Html5Qrcode(qrRegionId);

        try {
            console.log("Scanning QR code from file...");
            const decodedText = await scanner.scanFile(file, true);
            setPublicKey(decodedText.trim());
            console.log("QR code file scanned successfully");
        } catch (err) {
            console.error(err);
            alert("Invalid QR code image");
        }
    };

    // Handle Cancel
    const handleCancel = () => {
        navigate("/");
    };

    useEffect(() => {
        if (!identityManager) {
            navigate("/login");
            return;
        }

        return () => {
            qrScannerRef.current?.stop().catch(() => { });
            qrScannerRef.current = null;
        };
    }, [identityManager, navigate]);

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
                    {/* Username */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contact Username *
                        </label>
                        <input
                            type="text"
                            placeholder="Enter contact username"
                            className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            disabled={editMode}
                        />
                        {editMode && (
                            <p className="text-xs text-gray-500 mt-1">
                                Username cannot be changed
                            </p>
                        )}
                    </div>

                    {/* Public Key */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contact Public Key *
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Enter contact public key or scan QR"
                                className="flex-1 border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={publicKey}
                                onChange={(e) => setPublicKey(e.target.value)}
                            />

                            <button
                                type="button"
                                onClick={startScanner}
                                title="Scan QR Code"
                                className="p-2 border border-gray-300 rounded hover:bg-gray-100 transition"
                            >
                                <Camera size={20} />
                            </button>

                            <label title="Upload QR Code">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <div className="p-2 border border-gray-300 rounded cursor-pointer hover:bg-gray-100 transition">
                                    <Upload size={20} />
                                </div>
                            </label>
                        </div>
                        
                        {publicKey && (
                            <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-300">
                                <p className="text-xs text-gray-600 font-semibold mb-1">Public Key Preview:</p>
                                <p className="text-xs font-mono break-all text-gray-700">
                                    {publicKey.substring(0, 100)}
                                    {publicKey.length > 100 ? "..." : ""}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Camera preview */}
                    <div
                        id={qrRegionId}
                        className="w-full border border-gray-300 rounded overflow-hidden"
                    />

                    {/* Signaling Server URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Signaling Server URL (Optional)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., wss://server.example.com"
                            className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={signalingURL}
                            onChange={(e) => setSignalingURL(e.target.value)}
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition font-medium"
                        >
                            {editMode ? "Update Contact" : "Add Contact"}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400 transition font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </form>

                {/* Message */}
                {message && (
                    <div
                        className={`mt-4 p-3 rounded text-sm ${
                            messageType === "success"
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
