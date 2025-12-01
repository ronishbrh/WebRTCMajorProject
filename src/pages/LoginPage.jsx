import { useState } from "react";
import { IdentityManager } from "../utils/IdentityManager";

const identityManager = new IdentityManager();

export default function Login({ onUnlocked }) {
	const [userName, setUserName] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleLogin = async () => {
		try {
			const identity = await identityManager.unlockUser(userName, password);
			onUnlocked(identity); // parent component gets private key + AES key
		} catch (err) {
			console.log(err);
			const identity = await identityManager.createUser(userName, password);
			setError("Invalid credentials or user not found. New User created." + err);
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
				<input value={userName} onChange={e => setUserName(e.target.value)} placeholder="User ID" />
				<input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
				<button>Unlock</button>
				{error && <div style={{ color: "red" }}>{error}</div>}
			</form >
		</div>
	);
}
