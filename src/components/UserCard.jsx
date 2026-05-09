
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiTrash2, FiCopy, FiCheck, FiEdit2 } from "react-icons/fi";
import { ConfirmDialog } from "./ConfirmDialog";
import { exportECDSAPublicKey } from "../utils/crypto";

export default function UserCard({ user, allContacts, onClick, onCall, onDelete}) {

 
  const [selectedServer, setSelectedServer] = useState(user.contact.selectedSignallingServer)
  const [serverStatusMap, setServerStatusMap] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);


  const checkServer = async (url) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2000);

      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  };


  const getAllServers = () => {
    if (!allContacts) return [];

    const servers = [];

    allContacts.forEach(c => {
      const list = c.signallingServers ;

      list.forEach(url => servers.push(url));
    });

    return [...new Set(servers)]; // remove duplicates
  };

  const contactServers = user.signalingServers || [];

  const globalServers = getAllServers();

  const commonServers = contactServers.filter(url =>
    globalServers.includes(url)
  );

  const handleEdit = async (e) => {
    e.stopPropagation();

    try {
      console.log("Edit clicked. Public key type:", typeof user.publicKey);
      console.log("Public key value:", user.publicKey);


      let publicKeyString = user.publicKey;

      if (user.publicKey && typeof user.publicKey === 'object' && user.publicKey.type === 'public') {

        publicKeyString = await exportECDSAPublicKey(user.publicKey);

      } else if (typeof user.publicKey === 'string') {

        publicKeyString = user.publicKey;
      } else {
        console.warn("Unexpected public key format:", user.publicKey);
      }

      const contactData = {
        userName: user.name,
        publicKey: publicKeyString,
        signalingServers: user.signalingServers || []
      };

      console.log("Navigating to ContactPage with:", {
        editMode: true,
        originalUserName: user.name,
        contact: {
          ...contactData,
          publicKey: contactData.publicKey.substring(0, 50) + "..."
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


  useEffect(() => {
    const checkAll = async () => {
      const result = {};

      for (const url of commonServers) {
        result[url] = await checkServer(url);
      }

      setServerStatusMap(result);
    };
  }, [commonServers]);

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

      {commonServers.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">

          <p className="text-xs font-semibold text-gray-600 mb-2">
            Select Signaling Server
          </p>

          {/* Dropdown header */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
            className="w-full flex items-center justify-between bg-white border p-2 rounded"
          >
            <span className="text-xs font-mono truncate">
              {selectedServer || "Choose server"}
            </span>
            <span>{dropdownOpen ? "▲" : "▼"}</span>
          </button>

          {/* Dropdown list */}
          {dropdownOpen && (
            <div className="mt-2 space-y-2">
              {commonServers.map((url, idx) => {
                const status = serverStatusMap[url];

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer "bg-white"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedServer(url);
                      setDropdownOpen(false);
					  user.contact.selectedSignallingServer = url;
                    }}
                  >
                    <span className="text-xs font-mono break-all flex-1">
                      {url}
                    </span>

                    <span className="text-xs ml-2">
                      {status === true && "🟢"}
                      {status === false && "🔴"}
                      {status === undefined && "🟡"}
                    </span>
                  </div>
                );
              })}
            </div>
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
            //onCall(selectedServer || commonServers[0]);
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
