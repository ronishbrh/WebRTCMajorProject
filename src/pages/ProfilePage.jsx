import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { FiCopy } from 'react-icons/fi';
import { FaQrcode } from "react-icons/fa";

import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { exportECDSAPublicKey } from "../utils/crypto";


import profileIcon from "../assets/userProfileGeneric.png";


export default function ProfilePage() {
    const navigate = useNavigate();

    const { identity } = useUser();

    const [name, setName] = useState(identity?.userName);
    const [pubKey, setPubKey] = useState("");

    const [showQR, setShowQR] = useState(false);
    const qrRef = useRef();

    const copyPublicKey = () => {
        navigator.clipboard.writeText(pubKey);

    }

    function downloadQR() {
        const canvas = qrRef.current.querySelector("canvas");
        const pngUrl = canvas.toDataURL("image/png");

        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = "public_key_qr.png";
        link.click();
    }

    async function shareQR() {
        const canvas = qrRef.current.querySelector("canvas");
        canvas.toBlob(async (blob) => {
            const file = new File([blob], "public_key_qr.png", { type: "image/png" });

            if (navigator.share) {
                await navigator.share({
                    title: "My Public Key",
                    text: "Scan this QR code to add my public key.",
                    files: [file]
                });
            } else {
                alert("Sharing not supported on this device");
            }
        });
    }


    useEffect(() => {
        if (!identity) {
            navigate("/");
        } else {
            const loadKey = async () => {
                const keyText = await exportECDSAPublicKey(identity.publicKey);
                setPubKey(keyText);
            };

            loadKey();
        }
    }, [identity, navigate]);

    return (
        <div className="w-full min-h-screen flex flex-col">
            <Navbar
                onHomeClick={() => navigate("/")}
                onContactClick={() => navigate("/contact")}
            />


            <main className="p-4 sm:p-6 flex-x">
                <h2 className="text-2xl font-semibold mb-4 ">User Profile</h2>
                <div className="flex items-center gap-x-10">

                    <img
                        src={profileIcon}
                        alt="profile"
                        className="w-59 h-59 sm:w-60 sm:h-60 rounded-full object-cover"
                    />

                    <div className="flex flex-col">

                        <input
                            className="text-2xl font-large border-b border-gray-400 focus:outline-none"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />


                        <p className="wrap-break-words text-sm  text-gray-500 ">{pubKey}</p>
                        <div className="flex flex-row gap-4">
                            <button onClick={copyPublicKey} className="text-gray-600 hover:text-black">
                            <FiCopy size={20} />
                        </button>
                        <button onClick={() => setShowQR(true)} className="text-gray-600 hover:text-black">
                            <FaQrcode size={20} />
                        </button>
                        </div>
                        
                    </div>
                </div>

            </main>

            {showQR && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center px-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl text-center">
                        <h3 className="text-lg font-semibold mb-3">Public Key QR Code</h3>

                        <div ref={qrRef} className="p-4 bg-white rounded">
                            <QRCodeCanvas value={pubKey} size={220} />
                        </div>

                        <div className="flex justify-between mt-4 gap-3">

                            {/* Download button */}
                            <button
                                onClick={downloadQR}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                            >
                                Download
                            </button>

                            {/* Share button */}
                            <button
                                onClick={shareQR}
                                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                            >
                                Share
                            </button>

                            {/* Close */}
                            <button
                                onClick={() => setShowQR(false)}
                                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>


    );

}
