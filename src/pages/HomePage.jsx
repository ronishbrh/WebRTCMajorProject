import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import UserCard from "../components/UserCard";
import { useUser } from "../utils/UserContext";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

export default function HomePage() {
  const navigate = useNavigate();
  const { identity } = useUser();
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    if (!identity) {
      navigate("/login");
      return;
    }

    const loadContacts = async () => {
      const list = await identityManager.getContacts(identity.userName);
      setContacts(list);
    };

    loadContacts();
  }, [identity, navigate]);

  const handleCall = (contact) => {
    navigate(`/call/${contact.userName}`, { state: contact });
  };

  const handleDelete = async (contact) => {
    if (!identity) return;

    try {
      await identityManager.deleteContact(identity.userName, contact.userName);
      setContacts((prev) =>
        prev.filter((c) => c.userName !== contact.userName)
      );
    } catch (err) {
      console.error("Failed to delete contact:", err);
      alert("Failed to delete contact. Try again.");
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col">
      <Navbar
        onHomeClick={() => navigate("/")}
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
                key={contact.userName}
                user={{
                  name: contact.userName,
                  avatar:
                    contact.avatar ||
                    `https://placehold.co/80x80?text=${contact.userName
                      .charAt(0)
                      .toUpperCase()}`,
                }}
                onClick={() => handleCall(contact)}
                onCall={() => handleCall(contact)}
                onDelete={() => handleDelete(contact)} // inline deletion
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
