import profileIcon from "../assets/userProfileGeneric.png";

//const profileIcon = "https://via.placeholder.com/80";

export default function Navbar({ onHomeClick, username = "Your Name", key = "" }) {
  return (
    <nav className="w-full bg-white shadow px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
      <h1
        className="text-xl sm:text-2xl font-semibold cursor-pointer"
        onClick={onHomeClick}
      >
        HOME
      </h1>

      <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded-xl transition">
        <img
          src={profileIcon}
          alt="profile"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover"
        />

        <div className="hidden sm:block leading-tight text-right">
          <p className="font-medium">{username}</p>
          <p className="text-sm text-gray-500">{key}</p>
        </div>
      </div>
    </nav>
  );
}
