import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CallPage from "./pages/CallPage";
import LoginPage from "./pages/LoginPage";
import { useNavigate } from "react-router-dom";

export default function App() {
  const navigate = useNavigate();

	const handleUnlocked = (identity) => {
		navigate('/home');
		console.log("Called");
	}

  return (
      <div className="min-h-screen bg-gray-100 text-gray-900">
        <Routes>
          <Route path="/" element={<LoginPage onUnlocked={handleUnlocked} />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/call/:userId" element={<CallPage />} />
        </Routes>
      </div>
  );
}
