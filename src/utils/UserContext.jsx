import { createContext, useContext, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
	const [identity, setIdentity] = useState(null);

	

	return (
		<UserContext.Provider value={{ identity, setIdentity }}>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	return useContext(UserContext);
}