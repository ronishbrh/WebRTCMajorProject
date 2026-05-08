import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CallPage from "./pages/CallPage";
import ProfilePage from "./pages/ProfilePage";
import ContactPage from "./pages/ContactPage";
import LoginPage from "./pages/LoginPage";
import ServerPage from "./pages/ServerPage";
import { useNavigate } from "react-router-dom";
import { useUser } from "./utils/UserContext";


export default function App() {
	const navigate = useNavigate();

	const { setIdentityManager } = useUser();

	const handleUnlocked = (identity) => {

		setIdentityManager(identity);
		navigate('/');
	}

	return (
		<div className="min-h-screen bg-gray-100 text-gray-900">
			<Routes>

				<Route path="/" element={<HomePage />} />

				<Route path="/login" element={<LoginPage onUnlocked={handleUnlocked} />} />

				<Route path="/call/:userName" element={<CallPage />} />

				<Route path="/contact" element={<ContactPage />} />
				
				<Route path="/profile" element={<ProfilePage />} />
				<Route path="/server" element={<ServerPage />} />
			</Routes>
		</div>
	);
}
