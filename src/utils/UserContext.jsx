import { createContext, useContext, useState, useRef, useCallback } from "react";

const UserContext = createContext(null);

// ─── SocketManager ────────────────────────────────────────────────────────────
export class SocketManager {
  constructor(ws) {
    this.ws = ws;
    this.listeners = new Map();

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      console.log("[WS] Received:", data.type);
      const handler = this.listeners.get(data.type);
      if (handler) handler(data);
      else console.warn("[WS] No handler for:", data.type);
    };
  }

  subscribe(type, handler) {
    this.listeners.set(type, handler);
    return () => this.listeners.delete(type);
  }

  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error("[WS] Cannot send : readyState:", this.ws.readyState);
    }
  }

  isOpen() {
    return this.ws.readyState === WebSocket.OPEN;
  }

  close() {
    this.ws.close();
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function UserProvider({ children }) {
  const [identityManager, _setIdentityManager] = useState(null);

  const identityManagerRef = useRef(null);

  const setIdentityManager = useCallback((im) => {
    if (im === identityManagerRef.current) return; 
    identityManagerRef.current = im;
    _setIdentityManager(im);
  }, []);

  const socketsRef = useRef(new Map());

  const addSocket = (key, socket) => {
    socketsRef.current.set(key, socket);
    console.log("[Socket] Added:", key);
    console.log("[Socket] All keys:", [...socketsRef.current.keys()]);
  };

  const getSocket = (key) => {
    const s = socketsRef.current.get(key);
    console.log("[Socket] Get:", key, "=>", s ? "FOUND" : "NOT FOUND");
    console.log("[Socket] All keys:", [...socketsRef.current.keys()]);
    return s;
  };

  const listSockets = () => [...socketsRef.current.keys()];

  const removeSocket = (key) => {
    const s = socketsRef.current.get(key);
    if (s) { s.close(); socketsRef.current.delete(key); }
  };

  const closeAllSockets = () => {
    socketsRef.current.forEach((s) => s.close());
    socketsRef.current.clear();
  };

  return (
    <UserContext.Provider value={{
      identityManager,
      setIdentityManager,
      addSocket,
      getSocket,
      listSockets,
      removeSocket,
      closeAllSockets,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}