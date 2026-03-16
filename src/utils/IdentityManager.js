export class IdentityManager {
	constructor(dbName = "UserDataDB") {
		this.dbName = dbName;
	}

	// ---------------- IndexedDB helpers ----------------
	async _openDB() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = (e) => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
				if (!db.objectStoreNames.contains("secureData")) db.createObjectStore("secureData");
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
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
			const request = tx.objectStore(storeName).get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	// ---------------- Key derivation ----------------
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

	async _encrypt(data, aesKey) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			aesKey,
			new TextEncoder().encode(JSON.stringify(data))
		);
		return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
	}

	async _decrypt(encrypted, aesKey) {
		const iv = new Uint8Array(encrypted.iv);
		const ciphertext = new Uint8Array(encrypted.ciphertext);
		const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
		return JSON.parse(new TextDecoder().decode(decrypted));
	}

	// ---------------- Create new user identity ----------------
	async createUser(userName, password) {
		const keyPair = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"]
		);

		const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

		const salt = crypto.getRandomValues(new Uint8Array(16));
		const aesKey = await this._deriveAESKey(password, salt);
		const encryptedPrivateKey = await this._encrypt(jwkPrivate, aesKey);

		await this._storeObject("keys", userName, {
			userName,
			encryptedPrivateKey,
			salt: Array.from(salt),
			publicKey: keyPair.publicKey,
			contacts: [],
			stunServers: [],
			turnServers: [],
			signallingServers: []
		});

		console.log("User created");
		return { userName: userName, publicKey: keyPair.publicKey };
	}

	// ---------------- Unlock user identity ----------------
	async unlockUser(userName, password) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		if (userName != record.userName) {
			console.error("userName doesn't match the userName stored in value \t", + userName + "\t" + record.userName);
		}

		const salt = new Uint8Array(record.salt);
		const aesKey = await this._deriveAESKey(password, salt);

		const jwkPrivate = await this._decrypt(record.encryptedPrivateKey, aesKey);
		const privateKey = await crypto.subtle.importKey(
			"jwk",
			jwkPrivate,
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["sign"]
		);

		return { userName: userName, privateKey, publicKey: record.publicKey, aesKey, contacts: record.contacts };
	}

	// ---------------- Store encrypted user data ----------------
	async storeUserData(userName, aesKey, data) {
		const encryptedData = await this._encrypt(data, aesKey);
		await this._storeObject("secureData", userName, encryptedData);
	}

	async loadUserData(userName, aesKey) {
		const record = await this._getObject("secureData", userName);
		if (!record) return null;
		return this._decrypt(record, aesKey);
	}

	// ============ CONTACT MANAGEMENT ============

	// Add a contact for the given user
	async addContact(userName, contact) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.contacts = record.contacts || [];
		record.contacts.push(contact);

		await this._storeObject("keys", userName, record);
	}

	// Get contacts for a given user
	async getContacts(userName) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		return record.contacts || [];
	}

	// Delete a contact
	async deleteContact(userName, contactUserName) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.contacts = (record.contacts || []).filter(
			(c) => c.userName !== contactUserName
		);

		await this._storeObject("keys", userName, record);
	}

	async updateContactSignalingServer(userName, contactUserName, serverURL) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		const contact = (record.contacts || []).find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");

		if (serverURL === null) {
			// Remove server from contact
			delete contact.signalingServerURL;
		} else {
			// Update/set server for contact
			contact.signalingServerURL = serverURL;
		}

		await this._storeObject("keys", userName, record);
		return contact;
	}

	// Get signaling server for a specific contact
	async getContactSignalingServer(userName, contactUserName) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		const contact = (record.contacts || []).find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");

		return contact.signalingServerURL || null;
	}

	// Update other contact fields
	async updateContact(userName, contactUserName, updates) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		const contactIndex = (record.contacts || []).findIndex(c => c.userName === contactUserName);
		if (contactIndex === -1) throw new Error("Contact not found");

		record.contacts[contactIndex] = {
			...record.contacts[contactIndex],
			...updates
		};

		await this._storeObject("keys", userName, record);
		return record.contacts[contactIndex];
	}

	// ============ USERNAME MANAGEMENT ============

	async updateUsername(oldName, newName) {
		const user = await this._getObject("keys", oldName);
		if (!user) throw new Error("User not found");

		const db = await this._openDB()
		const tx = db.transaction("keys", "readwrite")
		const store = tx.objectStore("keys")

		user.userName = newName;

		store.delete(oldName)
		store.put(user, newName)

		await new Promise((resolve, reject) => {
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});

		return user;
	}

	// ============ STUN SERVER MANAGEMENT ============

	async addStunServer(userName, stunUrl) {
		const record = await this._getObject("keys", userName)
		if (!record) throw new Error("User not found!")
		record.stunServers = record.stunServers || []

		if (!record.stunServers.includes(stunUrl)) {
			record.stunServers.push(stunUrl)
		}
		await this._storeObject("keys", userName, record)
	}

	async getStunServers(userName) {
		const record = await this._getObject("keys", userName)
		if (!record) throw new Error("User not found!")
		return record.stunServers || []
	}

	async deleteStunServer(userName, stunUrl) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.stunServers = (record.stunServers || []).filter(
			(s) => s !== stunUrl
		);

		await this._storeObject("keys", userName, record);
	}

	// ============ TURN SERVER MANAGEMENT ============

	async addTurnServer(userName, turnServer) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.turnServers = record.turnServers || [];

		record.turnServers.push(turnServer);

		await this._storeObject("keys", userName, record);
	}

	async getTurnServers(userName) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		return record.turnServers || [];
	}

	async deleteTurnServer(userName, serverUrl) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.turnServers = (record.turnServers || []).filter(
			(s) => s.url !== serverUrl
		);

		await this._storeObject("keys", userName, record);
	}

	// ============ SIGNALLING SERVER MANAGEMENT ============

	async addSignallingServer(userName, url, owner = "manual") {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.signallingServers = record.signallingServers || [];

		const exists = record.signallingServers.find((server) => server.url === url)

		if (!exists) {
			record.signallingServers.push({
				url,
				owner
			});
		}

		await this._storeObject("keys", userName, record);
	}

	async getSignallingServers(userName) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		return record.signallingServers || [];
	}

	async deleteSignallingServer(userName, url) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		record.signallingServers =
			(record.signallingServers || []).filter(s => s.url !== url);

		await this._storeObject("keys", userName, record);
	}

	// Set active signaling server for user
	async setActiveSignallingServer(userName, url) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");
		record.activeSignallingServer = url;
		await this._storeObject("keys", userName, record);
	}

	// Get active signaling server for user
	async getActiveSignallingServer(userName) {
		const record = await this._getObject("keys", userName);
		return record?.activeSignallingServer || null;
	}
}