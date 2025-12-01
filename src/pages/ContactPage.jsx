import { useState } from "react";
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import { useUser } from '../utils/UserContext';
import { IdentityManager } from '../utils/IdentityManager.js';
import { importECDSAPublicKey } from "../utils/crypto.js";

export default function ContactPage() {
    const navigate = useNavigate();
    const { identity } = useUser();
    const identityManager = new IdentityManager();

    const [userName, setUserName] = useState("");
    const [publicKey, setPublicKey] = useState('');
    const [signalingURL, setSignalingURL] = useState('');
    const [message, setMessage] = useState('');

    const handleAddContact = async (e) => {
        e.preventDefault();

        if (!userName || !publicKey) {
            setMessage("Username and Public Key are required!");
            return;
        }

        try {

            const existingContacts = identity.contacts;

            // Check if contact already exists
            const duplicate = existingContacts.find(c => c.publicKey === publicKey);
            if (duplicate) {
                setMessage("Contact already exists!");
                return;
            }

            const contact = { userName, publicKey: await importECDSAPublicKey(publicKey), signalingServerURL: signalingURL };
            await identityManager.addContact(identity.userName, contact);

            setMessage("Contact added successfully");
            setUserName("");
            setPublicKey("");
            setSignalingURL("");
        } catch (err) {
            console.log(err);
            setMessage("Error occurred adding contact");

        }
    };

	useEffect(() => {
		if (!identity) {
			navigate("/login");
			return;
		}
	}, [identity, navigate]);

    return (
        <div className="w-full min-h-screen flex flex-col">
            <Navbar onHomeClick={() => navigate("/")} onProfileClick={() => navigate("/profile")} />

            <main className="p-4 sm:p-6 flex-1 max-w-md mx-auto">
                <h2 className="text-2xl font-semibold mb-4">Add New Contact</h2>

                <form className="flex flex-col gap-4" onSubmit={handleAddContact}>
                    <input
                        type="text"
                        placeholder="Contact Username"
                        className="border p-2 rounded"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                    />

                    <input
                        type="text"
                        placeholder="Contact Public Key"
                        className="border p-2 rounded"
                        value={publicKey}
                        onChange={(e) => setPublicKey(e.target.value)}
                    />

                    <input
                        type="text"
                        placeholder="Signaling Server URL"
                        className="border p-2 rounded"
                        value={signalingURL}
                        onChange={(e) => setSignalingURL(e.target.value)}
                    />

                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                    >
                        Add Contact
                    </button>
                </form>
                {message && <p className="mt-4 text-sm text-green-600">{message}</p>}
            </main>
        </div>
    )
}
