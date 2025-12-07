export function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div
      className="absolute top-full right-0 mt-2 bg-white p-4 rounded shadow-lg z-50"
      onClick={(e) => e.stopPropagation()} // prevent bubbling to UserCard div
    >
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="mb-4">{message}</p>
      <div className="flex justify-around">
        <button
          onClick={onConfirm}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Yes, Delete
        </button>
        <button
          onClick={onCancel}
          className="bg-gray-300 px-4 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
