import { useState } from "react";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

export default function Login({ onUnlocked }) {
	const [userId, setUserId] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleLogin = async () => {
		try {
			const identity = await identityManager.unlockUser(userId, password);
			console.log("Found user");
			onUnlocked(identity); // parent component gets private key + AES key
		} catch (err) {
			const identity = await identityManager.createUser(userId, password);
			setError("Invalid credentials or user not found. New User created.");
		}
	};

	return (
		<div>
			<form
				onSubmit={(e) => {
					e.preventDefault();   // prevent page refresh
					handleLogin();        // trigger login
				}}
			>
				<input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" />
				<input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
				<button onClick={handleLogin}>Unlock</button>
				{error && <div style={{ color: "red" }}>{error}</div>}
			</form >
		</div>
	);
}
