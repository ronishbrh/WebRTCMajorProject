import profileIcon from "../assets/userProfileGeneric.png";
import { useUser } from "../utils/UserContext";

//const profileIcon = "https://via.placeholder.com/80";

export default function Navbar({ onHomeClick, onProfileClick, onContactClick}) {
  const {identity} = useUser();
  return (
    <nav className="w-full bg-white shadow px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
      <div className="flex gap-x-8">
        <h1
          className="text-xl sm:text-2xl font-semibold cursor-pointer"
          onClick={onHomeClick}
        >
          HOME
        </h1>
        <h1
          className="text-xl sm:text-2xl font-semibold cursor-pointer"

        >
          SERVER
        </h1>

        <h1
          className="text-xl sm:text-2xl font-semibold cursor-pointer"
          onClick={onContactClick}
        >
          CONTACT
        </h1>
      </div>


      <div
        className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded-xl transition"
        onClick={onProfileClick}
      >
        <img
          src={profileIcon}
          alt="profile"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover"
        />

        <div className="hidden sm:block leading-tight text-right">
          <p className="font-medium">{identity?.userName || "Loading..."}</p>
          
        </div>
      </div>
    </nav>
  );
}
