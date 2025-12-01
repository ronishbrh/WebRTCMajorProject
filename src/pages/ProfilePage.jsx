import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/Navbar.jsx";
import { useUser } from "../utils/UserContext";
import { exportKey } from "../utils/crypto";


import profileIcon from "../assets/userProfileGeneric.png";
import { useState } from "react";

export default function ProfilePage() {
    const navigate = useNavigate();

    const { identity } = useUser();

    const [name, setName] = useState(identity?.userName);
    const [pubKey, setPubKey] = useState("");

    useEffect(() => {
        if (!identity) {
            navigate("/");
        } else {
            const loadKey = async () => {
                const keyText = await exportKey(identity.publicKey);
                setPubKey(keyText);
            };

            loadKey();
        }
    }, [identity, navigate]);

    return (
        <div className="w-full min-h-screen flex flex-col">
            <Navbar
                onHomeClick={() => navigate("/home")}
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
                    </div>
                </div>

            </main>
        </div>
    );

}