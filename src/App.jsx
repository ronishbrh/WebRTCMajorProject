import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CallPage from "./pages/CallPage";
import ProfilePage from "./pages/ProfilePage";
import ContactPage from "./pages/ContactPage";
import LoginPage from "./pages/LoginPage";
import ServerPage from "./pages/ServerPage";
import AdminPanel from "./pages/AdminPanel";

// App must NOT call useUser() or useNavigate() here.
// Doing so causes App to re-render whenever identityManager changes,
// which remounts every child page and destroys their useEffect state.
// The login callback is handled inside LoginPage instead.

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <Routes>
        <Route path="/"            element={<HomePage />} />
        <Route path="/login"       element={<LoginPage />} />
        <Route path="/call/:userName" element={<CallPage />} />
        <Route path="/contact"     element={<ContactPage />} />
        <Route path="/profile"     element={<ProfilePage />} />
        <Route path="/server"      element={<ServerPage />} />
        <Route path="/admin"       element={<AdminPanel />} />
      </Routes>
    </div>
  );
}