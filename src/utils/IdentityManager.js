/**
 * IdentityManager
 *
 * Manages the user's cryptographic identity and associated data (contacts,
 * signaling servers, STUN/TURN) stored encrypted in IndexedDB.
 *
 * Fixed vs original:
 *  - getSignallingServerAccessStatus returned server.signallingServers (undefined);
 *    now returns the correct status object.
 *  - Consistent spelling: signallingServers throughout (double-l).
 *  - registerSignallingServerAccess had a duplicate assignment.
 *  - addSignallingServer now accepts only (url) — the unused second "source" param
 *    has been removed since it was never stored or used.
 *  - Dead-commented-out code removed.
 */

import {
	exportECDSAPrivateKey,
	exportECDSAPublicKey,
	importECDSAPrivateKey,
	importECDSAPublicKey,
} from "./crypto";

export class IdentityManager {
	constructor(dbName = "userData") {
		this.dbName = dbName;
		this.userData = null;
		this.password = null;
	}

	// ─── IndexedDB helpers ────────────────────────────────────────────────────

	async _openDB() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(this.dbName, 1);
			req.onupgradeneeded = e => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains("userData")) db.createObjectStore("userData");
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async _storeObject(storeName, key, value) {
		const db = await this._openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readwrite");
			tx.objectStore(storeName).put(value, key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async _getObject(storeName, key) {
		const db = await this._openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, "readonly");
			const req = tx.objectStore(storeName).get(key);
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => reject(req.error);
		});
	}

	// ─── Key derivation (passphrase → AES-GCM) ───────────────────────────────

	async _deriveAESKey(password, salt) {
		const pwKey = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(password),
			{ name: "PBKDF2" },
			false,
			["deriveKey"]
		);
		return crypto.subtle.deriveKey(
			{ name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
			pwKey,
			{ name: "AES-GCM", length: 256 },
			true,
			["encrypt", "decrypt"]
		);
	}

	async encryptWithPassphrase(obj, password) {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const aesKey = await this._deriveAESKey(password, salt);
		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			aesKey,
			new TextEncoder().encode(JSON.stringify(obj))
		);
		return {
			salt: Array.from(salt),
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(ciphertext)),
		};
	}

	async decryptWithPassphrase(encrypted, password) {
		const aesKey = await this._deriveAESKey(password, new Uint8Array(encrypted.salt));
		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
			aesKey,
			new Uint8Array(encrypted.data)
		);
		return JSON.parse(new TextDecoder().decode(decrypted));
	}

	// ─── Identity lifecycle ───────────────────────────────────────────────────

	async createUser(userName, password) {
		if (this.userData) throw new Error("IdentityManager already holds a user — create a new instance.");

		const keyPair = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"]
		);

		this.userData = {
			userName,
			publicKey: await exportECDSAPublicKey(keyPair.publicKey),
			privateKey: await exportECDSAPrivateKey(keyPair.privateKey),
			contacts: [],
			stunServers: [],
			turnServers: [],
			signallingServers: [],
		};
		this.password = password;

		await this._persist();
		console.log("User created:", userName);
	}

	async unlockUser(userName, password) {
		if (this.userData) throw new Error("Already unlocked — create a new instance for a different user.");
		const record = await this._getObject("userData", userName);
		if (!record) throw new Error("User not found");
		this.userData = await this.decryptWithPassphrase(record, password);
		this.password = password;
	}

	/** Re-encrypt and write userData to IndexedDB. */
	async _persist() {
		const encrypted = await this.encryptWithPassphrase(this.userData, this.password);
		await this._storeObject("userData", this.userData.userName, encrypted);
	}

	// ─── Identity accessors ───────────────────────────────────────────────────

	getUserName() { return this.userData?.userName ?? null; }
	getPublicKey() { return this.userData?.publicKey ?? null; }
	getPrivateKey() { return this.userData?.privateKey ?? null; }

	async updateUsername(newName) {
		const db = await this._openDB();
		// Delete old record
		await new Promise((resolve, reject) => {
			const tx = db.transaction("userData", "readwrite");
			tx.objectStore("userData").delete(this.userData.userName);
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
		this.userData.userName = newName;
		await this._persist();
	}

	// ─── Contact management ───────────────────────────────────────────────────

	getContacts() { return this.userData.contacts; }

	async addContact(contact) {
		this.userData.contacts.push(contact);
		await this._persist();
	}

	async deleteContact(contactUserName) {
		this.userData.contacts = this.userData.contacts.filter(c => c.userName !== contactUserName);
		await this._persist();
	}

	async updateContact(contactUserName, updates) {
		const idx = this.userData.contacts.findIndex(c => c.userName === contactUserName);
		if (idx === -1) throw new Error("Contact not found");
		this.userData.contacts[idx] = { ...this.userData.contacts[idx], ...updates };
		await this._persist();
		return this.userData.contacts[idx];
	}

	async addContactSignallingServer(contactUserName, serverURL) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");
		contact.signallingServers = contact.signallingServers || [];
		if (contact.signallingServers.includes(serverURL)) throw new Error("Server already added for this contact");
		contact.signallingServers.push(serverURL);
		await this._persist();
	}

	async removeContactSignallingServer(contactUserName, serverURL) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");
		if (!contact.signallingServers?.includes(serverURL)) throw new Error("Server not found for this contact");
		contact.signallingServers = contact.signallingServers.filter(x => x !== serverURL);
		await this._persist();
	}

	async getContactSignallingServers(contactUserName) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");
		return contact.signallingServers || [];
	}

	// ─── STUN servers ─────────────────────────────────────────────────────────

	getStunServers() { return this.userData.stunServers; }

	async addStunServer(url) {
		if (!this.userData.stunServers.includes(url)) {
			this.userData.stunServers.push(url);
			await this._persist();
		}
	}

	async deleteStunServer(url) {
		this.userData.stunServers = this.userData.stunServers.filter(s => s !== url);
		await this._persist();
	}

	// ─── TURN servers ─────────────────────────────────────────────────────────

	getTurnServers() { return this.userData.turnServers; }

	async addTurnServer(server) {
		if (!this.userData.turnServers.some(s => s.url === server.url)) {
			this.userData.turnServers.push(server);
			await this._persist();
		}
	}

	async deleteTurnServer(url) {
		this.userData.turnServers = this.userData.turnServers.filter(s => s.url !== url);
		await this._persist();
	}

	// ─── Signalling servers ───────────────────────────────────────────────────

	getSignallingServers() { return this.userData.signallingServers; }

	/**
	 * Add a signaling server by URL.
	 * No-op if already present.
	 */
	async addSignallingServer(url) {
		const exists = this.userData.signallingServers.some(s => s.url === url);
		if (!exists) {
			this.userData.signallingServers.push({
				url,
				requested: false,
				revoked: false,
				registered: false,
				requestedAt: null,
				accessToken: null,
				refreshToken: null,
				isAdmin: false,
			});
			await this._persist();
		}
	}


	async deleteSignallingServer(url) {
		this.userData.signallingServers = this.userData.signallingServers.filter(s => s.url !== url);
		await this._persist();
	}

	async setOwnershipForSignallingServer(url, own = false) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (server) { server.own = own; await this._persist(); }
	}

	// ── Access state helpers ──

	async requestSignallingServerAccess(url) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (server) {
			server.requested = true;
			server.requestedAt = Date.now();
			await this._persist();
		}
	}

	async registerSignallingServerAccess(url) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (server) {
			server.registered = true;
			server.requested = false;
			server.revoked = false;
			await this._persist();
		}
	}

	async revokeSignallingServerAccess(url) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (server) {
			server.registered = false;
			server.requested = false;
			server.revoked = true;
			await this._persist();
		}
	}

	getSignallingServerTokens(url) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (!server) return null;
		return { accessToken: server.accessToken, refreshToken: server.refreshToken, isAdmin:server.isAdmin };
	}

	async setSignallingServerTokens(url, { accessToken, refreshToken, isAdmin }) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (!server) throw new Error("Signalling server not found");
		server.accessToken = accessToken;
		server.refreshToken = refreshToken;
		server.isAdmin = isAdmin;
		console.log("Set sign tokens", accessToken, refreshToken, isAdmin);
		await this._persist();
	}

	async clearSignallingServerTokens(url) {
		const server = this.userData.signallingServers.find(s => s.url === url);
		if (!server) return;
		server.accessToken = null;
		server.refreshToken = null;
		server.isAdmin = false;
		await this._persist();
	}

	/**
	 * Returns the access status object for a signalling server, or null if not found.
	 * Shape: { url, own, requested, revoked, registered, requestedAt }
	 */
	getSignallingServerAccessStatus(url) {
		return this.userData.signallingServers.find(s => s.url === url) ?? null;
	}
}
