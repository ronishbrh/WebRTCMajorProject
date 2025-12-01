import { useEffect, useState } from "react";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useNavigate } from "react-router-dom";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager.js";

export default function HomePage() {
  const navigate = useNavigate();
  const { identity } = useUser();
  const identityManager = new IdentityManager();

  const [contacts, setContacts] = useState([]);

  // Fetch contacts from IndexedDB
  useEffect(() => {
    if (!identity) {
      navigate("/");
      return;
    }

    const loadContacts = async () => {
      try {
        const storedContacts = await identityManager.getContacts(identity.userName);
        setContacts(storedContacts || []);
      } catch (err) {
        console.error("Failed to load contacts:", err);
      }
    };

    loadContacts();
  }, [identity, navigate]);

  const handleCall = (contact) => {
    navigate(`/call/${contact.userName}`);
  };

  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar 
        onHomeClick={() => navigate("/home")} 
        onProfileClick={() => navigate("/profile")} 
        onContactClick={() => navigate("/contact")}
      />

      <main className="p-4 sm:p-6 flex-1">
        <h2 className="text-2xl font-semibold mb-4">Connections</h2>

        <div className="space-y-3 w-full max-w-xl mx-auto mt-2">
          {contacts.length === 0 ? (
            <p className="text-gray-500">No contacts found.</p>
          ) : (
            contacts.map((contact) => (
              <UserCard
                key={contact.userName} // username as unique key
                user={{
                  name: contact.userName,
                  avatar: contact.avatar || "https://placehold.co/80x80?text=U",
                }}
                onClick={() => handleCall(contact)}
                onCall={() => handleCall(contact)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
