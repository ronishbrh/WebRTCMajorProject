import { createContext, useContext, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
	const [identityManager, setIdentityManager] = useState(null);

	return (
		<UserContext.Provider value={{ identityManager, setIdentityManager }}>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	return useContext(UserContext);
}
