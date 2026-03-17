
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiTrash2, FiCopy, FiCheck, FiEdit2 } from "react-icons/fi";
import { ConfirmDialog } from "./ConfirmDialog";
import { exportECDSAPublicKey } from "../utils/crypto";

export default function UserCard({ user, onClick, onCall, onDelete }) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copiedServerURL, setCopiedServerURL] = useState(false);

  // Copy URL to clipboard
  const handleCopyServerURL = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(user.signalingServerURL);
      setCopiedServerURL(true);
      setTimeout(() => {
        setCopiedServerURL(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      alert('Failed to copy URL');
    }
  };

  // Navigate to ContactPage with edit mode
  const handleEdit = async (e) => {
    e.stopPropagation();
    
    try {
      console.log("Edit clicked. Public key type:", typeof user.publicKey);
      console.log("Public key value:", user.publicKey);
      
      // Export public key if it's a CryptoKey object
      let publicKeyString = user.publicKey;
      
      if (user.publicKey && typeof user.publicKey === 'object' && user.publicKey.type === 'public') {
        // It's a CryptoKey, export it to base64
        console.log("Exporting CryptoKey to base64...");
        publicKeyString = await exportECDSAPublicKey(user.publicKey);
        console.log("Exported public key (first 50 chars):", publicKeyString.substring(0, 50));
      } else if (typeof user.publicKey === 'string') {
        // Already a string, use as-is
        console.log("Public key is already a string");
        publicKeyString = user.publicKey;
      } else {
        console.warn("Unexpected public key format:", user.publicKey);
      }
      
      const contactData = {
        userName: user.name,
        publicKey: publicKeyString,  // ✅ Base64 string!
        signalingServerURL: user.signalingServerURL || ""
      };
      
      console.log("Navigating to ContactPage with:", {
        editMode: true,
        originalUserName: user.name,
        contact: {
          ...contactData,
          publicKey: contactData.publicKey.substring(0, 50) + "..." // Show first 50 chars
        }
      });
      
      navigate("/contact", {
        state: {
          editMode: true,
          originalUserName: user.name,
          contact: contactData
        }
      });
    } catch (err) {
      console.error("Failed to export public key:", err);
      alert("Failed to edit contact. Error: " + err.message);
    }
  };

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col bg-white p-3 sm:p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
    >
      {/* Top section: Avatar and basic info */}
      <div className="flex items-center gap-4 mb-3">
        <img
          src={user.avatar || "https://via.placeholder.com/80"}
          alt={user.name}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">{user.name}</p>
        </div>
      </div>

      {user.signalingServerURL && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Signaling Server:</p>
          
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-mono text-gray-700 break-all bg-white p-2 rounded border border-gray-300">
                {user.signalingServerURL}
              </p>
            </div>
            
            <button
              onClick={handleCopyServerURL}
              className="p-2 flex-shrink-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition"
              title="Copy server URL to clipboard"
            >
              {copiedServerURL ? (
                <FiCheck size={16} />
              ) : (
                <FiCopy size={16} />
              )}
            </button>
          </div>

          {copiedServerURL && (
            <p className="text-xs text-green-600 mt-1">✓ Copied to clipboard</p>
          )}
        </div>
      )}

      {/* Bottom section: Action buttons */}
      <div className="flex gap-2 justify-end">
        {/* Edit button */}
        <button
          onClick={handleEdit}
          aria-label={`edit-user-${user.name}`}
          className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition flex-shrink-0"
          title="Edit contact"
        >
          <FiEdit2 size={18} />
        </button>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={`delete-user-${user.name}`}
          className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition flex-shrink-0"
          title="Delete contact"
        >
          <FiTrash2 size={18} />
        </button>

        {/* Call button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCall();
          }}
          aria-label={`call-user-${user.name}`}
          className="p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition flex-shrink-0"
          title="Call contact"
        >
          📞
        </button>
      </div>

      {/* Confirm Delete Dialog */}
      {confirmOpen && (
        <ConfirmDialog
          open={confirmOpen}
          title="Confirm Delete"
          message={`Are you sure you want to delete ${user.name}?`}
          onConfirm={async () => {
            await onDelete();
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}