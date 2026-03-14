import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager.js";
import { importECDSAPublicKey } from "../utils/crypto.js";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Upload } from "lucide-react";

export default function ContactPage() {
    const navigate = useNavigate();
    const { identity } = useUser();
    const identityManager = new IdentityManager();

    const [userName, setUserName] = useState("");
    const [publicKey, setPublicKey] = useState("");
    const [signalingURL, setSignalingURL] = useState("");
    const [message, setMessage] = useState("");

    const qrRegionId = "qr-reader";
    const qrScannerRef = useRef(null);

    const handleAddContact = async (e) => {
        e.preventDefault();

        if (!userName || !publicKey) {
            setMessage("Username and Public Key are required!");
            return;
        }

        try {
            const existingContacts = identity.contacts || [];

            const duplicate = existingContacts.find(
                (c) => c.publicKey === publicKey
            );
            if (duplicate) {
                setMessage("Contact already exists!");
                return;
            }

            const importedKey = await importECDSAPublicKey(publicKey.trim());

            const contact = {
                userName,
                publicKey: importedKey,
                signalingServerURL: signalingURL,
            };

            await identityManager.addContact(identity.userName, contact);
            identity.contacts.push(contact);

            setMessage("Contact added successfully");
            setUserName("");
            setPublicKey("");
            setSignalingURL("");
        } catch (err) {
            console.error(err);
            setMessage("Failed to add contact");
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
            const decodedText = await scanner.scanFile(file, true);
            setPublicKey(decodedText.trim());
        } catch (err) {
            console.error(err);
            alert("Invalid QR code image");
        }
    };

    useEffect(() => {
        if (!identity) {
            navigate("/login");
            return;
        }

        return () => {
            qrScannerRef.current?.stop().catch(() => { });
            qrScannerRef.current = null;
        };
    }, [identity, navigate]);


    return (
        <div className="w-full min-h-screen flex flex-col">
            <Navbar
                onHomeClick={() => navigate("/")}
                onProfileClick={() => navigate("/profile")}
                onServerClick={() => navigate("/server")}
            />

            <main className="p-4 sm:p-6 flex-1 max-w-md mx-auto">
                <h2 className="text-2xl font-semibold mb-4">Add New Contact</h2>

                <form className="flex flex-col gap-4" onSubmit={handleAddContact}>
                    <input
                        type="text"
                        placeholder="Contact Username"
                        className="border p-2 rounded"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                    />
                  
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Contact Public Key"
                            className="flex-1 border p-2 rounded"
                            value={publicKey}
                            onChange={(e) => setPublicKey(e.target.value)}
                        />

                        <button
                            type="button"
                            onClick={startScanner}
                            title="Scan QR Code"
                            className="p-2 border rounded hover:bg-gray-100 transition"
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
                            <div className="p-2 border rounded cursor-pointer hover:bg-gray-100 transition">
                                <Upload size={20} />
                            </div>
                        </label>
                    </div>

                    {/* Camera preview  of qrRefion*/}
                    <div
                        id={qrRegionId}
                        className="w-full border rounded overflow-hidden"
                    />

                    <input
                        type="text"
                        placeholder="Signaling Server URL"
                        className="border p-2 rounded"
                        value={signalingURL}
                        onChange={(e) => setSignalingURL(e.target.value)}
                    />

                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                    >
                        Add Contact
                    </button>
                </form>

                {message && (
                    <p className="mt-4 text-sm text-green-600">{message}</p>
                )}
            </main>
        </div>
    );
}
