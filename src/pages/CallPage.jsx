import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function CallPage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen flex flex-col">
      

      <div className="flex-1 relative bg-black text-white flex items-stretch">
        {/* Remote video area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            {/* Replace with <video> element when integrating real streams */}
            <p className="text-lg opacity-60">Remote Video Stream — User {userId}</p>
          </div>
        </div>

        {/* Floating local preview */}
        <div className="absolute top-4 right-4 w-38 h-38 sm:w-36 sm:h-36 bg-gray-900 rounded-lg shadow-lg overflow-hidden flex items-center justify-center text-sm">
         
          <div className="text-center text-xs sm:text-sm">Your Video</div>
        </div>

        {/* Bottom control bar */}
        <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 px-4">
          <button
            onClick={() => navigate("/")}
            className="px-5 py-3 bg-red-600 hover:bg-red-700 rounded-full text-white text-base shadow-md cursor-pointer"
            aria-label="end-call"
          >
            🔴 End Call
          </button>

          <div className="flex items-center gap-3 bg-white bg-opacity-10 rounded-full p-2">
            <button className="p-2 rounded-full bg-white bg-opacity-8 hover:bg-opacity-20 cursor-pointer">
              🎙️
            </button>
            <button className="p-2 rounded-full bg-white bg-opacity-8 hover:bg-opacity-20 cursor-pointer">
              🎥
            </button>
            <button className="p-2 rounded-full bg-white bg-opacity-8 hover:bg-opacity-20 cursor-pointer">
              ⚙️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
