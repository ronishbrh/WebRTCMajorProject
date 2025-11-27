

export default function UserCard({ user, onClick, onCall }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between bg-white p-3 sm:p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
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

      <button
        onClick={(e) => {
          e.stopPropagation(); // prevent outer onClick
          onCall();
        }}
        aria-label={`call-user-${user.id}`}
        className="p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition"
      >
        📞
      </button>
    </div>
  );
}
