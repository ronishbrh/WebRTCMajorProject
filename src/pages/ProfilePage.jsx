import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { FiCopy } from "react-icons/fi";
import { FaQrcode } from "react-icons/fa";

import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { exportECDSAPublicKey } from "../utils/crypto";
import pako from "pako";

import profileIcon from "../assets/userProfileGeneric.png";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { identityManager } = useUser();

  const [pubKey, setPubKey] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");


  const [signalingServers, setSignalingServers] = useState([]);

  const qrRef = useRef();

  useEffect(() => {
    if (!identity) return;

    const load = async () => {
      setSignalingServers(identityManager.getSignallingServers());
    };

    load();
  }, [identity]);


  const buildQRData = () => {
    const data = JSON.stringify({
      t: "c",
      n: identity?.userName,
      k: pubKey,
      s: signalingServers
    });

    return btoa(String.fromCharCode(...pako.deflate(data)));
  };


  const saveName = async () => {
    if (!identityManager || name.trim() === "" || name === identityManager.getUserName()) return;

    try {
      setSaving(true);
      await identityManager.updateUsername( name);

      setSavedMessage("Username updated!");
      setTimeout(() => setSavedMessage(""), 2000);
    } catch (err) {
      console.error(err);
      alert("Failed to update username.");
    } finally {
      setSaving(false);
    }
  };

  const copyPublicKey = () => {
    navigator.clipboard.writeText(pubKey);
  };

  const downloadQR = () => {
    const canvas = qrRef.current.querySelector("canvas");
    const pngUrl = canvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "public_key_qr.png";
    link.click();
  };

  const shareQR = async () => {
    const canvas = qrRef.current.querySelector("canvas");
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], "public_key_qr.png", {
        type: "image/png",
      });

      if (navigator.share) {
        await navigator.share({
          title: "My Public Key",
          text: "Scan this QR code to add my public key.",
          files: [file],
        });
      } else {
        alert("Sharing not supported on this device");
      }
    });
  };



  useEffect(() => {
    if (!identityManager) {
      navigate("/");
      return;
    }

    const loadKey = async () => {
      const keyText = identityManager.getPublicKey();
      setPubKey(keyText);
    };

    loadKey();
  }, [identityManager, navigate]);

	if(!identityManager) return;
  const [name, setName] = useState(identityManager.getUserName());

  return (
    <div className="w-full min-h-screen flex flex-col bg-gray-50">
      <Navbar
        onHomeClick={() => navigate("/")}
        onContactClick={() => navigate("/contact")}
        onServerClick={() => navigate("/server")}
      />

      <main className="flex-1 p-4 sm:p-6">
        <h2 className="text-2xl font-semibold mb-6 text-center sm:text-left">
          User Profile
        </h2>

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow p-5 sm:p-6 max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-10">
            {/* Avatar */}
            <img
              src={profileIcon}
              alt="profile"
              className="w-32 h-32 sm:w-56 sm:h-56 rounded-full object-cover"
            />

            {/* Details */}
            <div className="flex flex-col w-full max-w-lg text-center sm:text-left">
              <input
                className="text-xl sm:text-2xl font-medium border-b border-gray-400 focus:outline-none text-center sm:text-left"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              {name !== identityManager.getUserName() && (
                <button
                  onClick={saveName}
                  disabled={saving}
                  className="mt-3 self-center sm:self-start bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              )}

              {savedMessage && (
                <p className="text-green-600 mt-2 text-sm">
                  {savedMessage}
                </p>
              )}

              {/* Public Key */}
              <div className="mt-5">
                <p className="text-xs text-gray-500 mb-1">Public Key</p>
                <p className="text-sm text-gray-700 break-all bg-gray-100 p-3 rounded-lg">
                  {pubKey}
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-center sm:justify-start gap-6 mt-4">
                <button
                  onClick={copyPublicKey}
                  className="text-gray-600 hover:text-black"
                  title="Copy public key"
                >
                  <FiCopy size={22} />
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  className="text-gray-600 hover:text-black"
                  title="Show QR code"
                >
                  <FaQrcode size={22} />
                </button>
              </div>
              <button
                onClick={() => navigate("/admin")}
                style={{
                  padding: "10px 15px",
                  marginTop: "20px",
                  cursor: "pointer"
                }}
              >
                Manage Server (Admin Panel)
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm p-5 rounded-xl shadow-xl text-center">
            <h3 className="text-lg font-semibold mb-4">
              Public Key QR Code
            </h3>

            <div ref={qrRef} className="flex justify-center mb-4">
              <QRCodeCanvas value={buildQRData()} size={200} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={downloadQR}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Download
              </button>

              <button
                onClick={shareQR}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Share
              </button>

              <button
                onClick={() => setShowQR(false)}
                className="flex-1 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
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
