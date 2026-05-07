import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import StunServerSection from "../components/StunServerSection";
import TurnServerSection from "../components/TurnServerSection";
import SignalingServerSection from "../components/SignalingServerSection";
import { useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";

export default function ServerPage() {
    const navigate = useNavigate()
    const [section, setSection] = useState("stun");


    const { identityManager } = useUser();

    useEffect(() => {
        if (!identityManager) {
            navigate("/login");
            return;
        }
    }, [identityManager, navigate]);

    return (
        <>
            <Navbar
                onHomeClick={() => navigate("/")}
                onContactClick={() => navigate("/contact")}
                onProfileClick={() => navigate("/profile")}
            />

            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">


                <div className="bg-white shadow-md rounded-xl p-4 sm:p-6">

                    <h1 className="text-xl sm:text-2xl font-semibold mb-6">
                        Server Settings
                    </h1>

                    {/* Tabs */}
                    <div className="flex flex-wrap gap-3 border-b pb-3 mb-6">

                        <button
                            onClick={() => setSection("stun")}
                            className={`px-3 py-1 rounded-lg text-sm sm:text-base
            ${section === "stun"
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                        >
                            STUN
                        </button>

                        <button
                            onClick={() => setSection("turn")}
                            className={`px-3 py-1 rounded-lg text-sm sm:text-base
            ${section === "turn"
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                        >
                            TURN
                        </button>

                        <button
                            onClick={() => setSection("signaling")}
                            className={`px-3 py-1 rounded-lg text-sm sm:text-base
            ${section === "signaling"
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                        >
                            SIGNALING
                        </button>

                    </div>

                    {section === "stun" && <StunServerSection />}
                    {section === "turn" && <TurnServerSection />}
                    {section === "signaling" && <SignalingServerSection />}

                </div>
            </div>
        </>
    );
}
