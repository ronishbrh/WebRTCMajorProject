import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CallPage from "./pages/CallPage";
import ProfilePage from "./pages/ProfilePage";
import ContactPage from "./pages/ContactPage";
import LoginPage from "./pages/LoginPage";
import { useNavigate } from "react-router-dom";
import { useUser } from "./utils/UserContext";


export default function App() {
	const navigate = useNavigate();

	const { setIdentity } = useUser();

	const handleUnlocked = (identity) => {

		setIdentity(identity);
		navigate('/home');
	}

	return (
		<div className="min-h-screen bg-gray-100 text-gray-900">
			<Routes>
				<Route path="/" element={<LoginPage onUnlocked={handleUnlocked} />} />

				<Route path="/home" element={<HomePage />} />

				<Route path="/call/:userName" element={<CallPage />} />

				<Route path="/contact" element={<ContactPage />} />
				
				<Route path="/profile" element={<ProfilePage />} />
			</Routes>
		</div>
	);
}
