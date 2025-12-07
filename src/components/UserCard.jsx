import { useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { ConfirmDialog } from "./ConfirmDialog";

export default function UserCard({ user, onClick, onCall, onDelete }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-between bg-white p-3 sm:p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <img
          src={user.avatar || "https://via.placeholder.com/80"}
          alt={user.name}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover"
        />
        <div>
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-gray-500">{user.status}</p>
        </div>
      </div>

      <div className="flex gap-2 relative">
        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={`delete-user-${user.id}`}
          className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition"
        >
          <FiTrash2 size={18} />
        </button>

        {/* Inline ConfirmDialog */}
        {confirmOpen && (
          <ConfirmDialog
            open={confirmOpen}
            title="Confirm Delete"
            message={`Are you sure you want to delete ${user.name}?`}
            onConfirm={async () => {
              await onDelete(); // HomePage callback
              setConfirmOpen(false);
            }}
            onCancel={() => setConfirmOpen(false)}
          />
        )}

        {/* Call button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCall();
          }}
          aria-label={`call-user-${user.id}`}
          className="p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition"
        >
          📞
        </button>
      </div>
    </div>
  );
}
