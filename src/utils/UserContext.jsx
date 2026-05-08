import { createContext, useContext, useState, useRef } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
	const [identityManager, setIdentityManager] = useState(null);
	const [allServerConnected, setAllServerConnected] = useState(false);

	// Map<string, WebSocket>
	const socketsRef = useRef(new Map());

	const addSocket = (key, socket) => {
		socketsRef.current.set(key, socket);
		console.log(`inserted key : ${key}, value : ${socket}`);
	};

	const getSocket = (key) => {
		console.log(`total inputs: ${socketsRef.current.size}`);
		console.log(`getting key : ${key}`);
		return socketsRef.current.get(key);
	};

	const removeSocket = (key) => {
		const socket = socketsRef.current.get(key);

		if (socket) {
			socket.close();
			socketsRef.current.delete(key);
		}
	};

	const closeAllSockets = () => {
		socketsRef.current.forEach((socket) => {
			socket.close();
		});

		socketsRef.current.clear();
		setAllServerConnected(false);
	};

	const closeAllSocketsExcept = (key) => {
		const socket = getSocket(key);

		if (socket) {
			socketsRef.current.delete(key);

			closeAllSockets();

			addSocket(key, socket);
		}
	};

	return (
		<UserContext.Provider
			value={{
				identityManager,
				setIdentityManager,

				sockets: socketsRef.current,
				addSocket,
				getSocket,
				removeSocket,
				closeAllSockets,
				closeAllSocketsExcept,
				allServerConnected,
				setAllServerConnected
			}}
		>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	return useContext(UserContext);
}


export class SocketManager {
	constructor(ws) {
		this.ws = ws;
		this.listeners = new Map();

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);

			console.log("Msg received:", data.type);
			const handler = this.listeners.get(data.type);

			if (handler) {
				handler(data);
			}
		};
	}

	subscribe(type, handler) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, handler);
		}

		return () => {
			this.listeners.delete(type);
		};
	}

	close() {
		this.ws.close();
	}

	send(data) {
		this.ws.send(JSON.stringify(data));
	}
}
