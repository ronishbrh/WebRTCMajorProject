import { useState } from "react";
import { IdentityManager } from "../utils/IdentityManager";


export default function Login({ onUnlocked }) {
	const [userName, setUserName] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [mode, setMode] = useState("login"); // "login" or "signup"

	const handleLogin = async () => {
		setError("");

		try {
			const identityManager = new IdentityManager();
			await identityManager.unlockUser(userName, password);

			onUnlocked(identityManager);
		} catch (err) {
			console.log(err);
			setError("Invalid username or password.");
		}
	};

	const handleSignup = async () => {
		setError("");

		try {
			const identityManager = new IdentityManager();
			await identityManager.createUser(userName, password);

			if (!identity.contacts) identity.contacts = [];

			onUnlocked(identityManager);
		} catch (err) {
			console.log(err);
			setError("Unable to create user. Choose a different username.");
		}
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		mode === "login" ? handleLogin() : handleSignup();
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-100">
			<div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
				<h2 className="text-2xl font-semibold text-center mb-6">
					{mode === "login" ? "Login" : "Create Account"}
				</h2>

				<form onSubmit={handleSubmit} className="space-y-4">
					<input
						className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
						placeholder="Username"
						value={userName}
						onChange={(e) => setUserName(e.target.value)}
					/>

					<input
						className="w-full p-3 border rounded-lg focus:ring focus:ring-blue-300"
						placeholder="Password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>

					<button
						type="submit"
						className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
					>
						{mode === "login" ? "Login" : "Sign Up"}
					</button>

					{error && (
						<div className="text-red-600 text-sm text-center mt-2">
							{error}
						</div>
					)}
				</form>

				{/* Switch mode */}
				<div className="text-center mt-4">
					{mode === "login" ? (
						<p className="text-sm">
							Don't have an account?{" "}
							<button
								className="text-blue-600 hover:underline"
								onClick={() => setMode("signup")}
							>
								Sign Up
							</button>
						</p>
					) : (
						<p className="text-sm">
							Already have an account?{" "}
							<button
								className="text-blue-600 hover:underline"
								onClick={() => setMode("login")}
							>
								Login
							</button>
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
