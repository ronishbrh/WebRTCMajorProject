import React from "react";
import Navbar from "../components/Navbar";
import UserCard from "../components/UserCard";
import { useNavigate } from "react-router-dom";

const CONNECTIONS = [
{ id: 1, name: "User One", status: "Available", avatar: "https://placehold.co/80x80?text=U1" },
{ id: 2, name: "User Two", status: "Available", avatar: "https://placehold.co/80x80?text=U2" },
{ id: 3, name: "User Three", status: "Away", avatar: "https://placehold.co/80x80?text=U3" },
];
export default function HomePage() {
  const navigate = useNavigate();

  const handleCall = (userId) => {
    // navigate to call route (SPA)
    navigate(`/call/${userId}`);
  };

  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar onHomeClick={() => navigate("/")} />

      <main className="p-4 sm:p-6 flex-1">
        <h2 className="text-2xl font-semibold mb-4">Connections</h2>

        <div className="space-y-3 w-full max-w-xl mx-auto mt-2">
          {CONNECTIONS.map((c) => (
            <UserCard
              key={c.id}
              user={c}
              onClick={() => handleCall(c.id)}
              onCall={() => handleCall(c.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
