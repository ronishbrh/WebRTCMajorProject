export class IdentityManager {

	constructor(dbName = "UserDataDB") {
		this.dbName = dbName;
	}

	// ================= DB HELPERS =================

	async _openDB() {

		return new Promise((resolve, reject) => {

			const request = indexedDB.open(this.dbName, 1);

			request.onupgradeneeded = (e) => {

				const db = e.target.result;

				if (!db.objectStoreNames.contains("keys")) {
					db.createObjectStore("keys");
				}

				if (!db.objectStoreNames.contains("secureData")) {
					db.createObjectStore("secureData");
				}
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

	// ================= KEY DERIVATION =================

	async _deriveAESKey(password, salt) {

		const pwKey = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(password),
			{ name: "PBKDF2" },
			false,
			["deriveKey"]
		);

		return crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt,
				iterations: 200000,
				hash: "SHA-256"
			},
			pwKey,
			{
				name: "AES-GCM",
				length: 256
			},
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

		return {
			iv: Array.from(iv),
			ciphertext: Array.from(new Uint8Array(ciphertext))
		};
	}

	async _decrypt(encrypted, aesKey) {

		const iv = new Uint8Array(encrypted.iv);
		const ciphertext = new Uint8Array(encrypted.ciphertext);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			aesKey,
			ciphertext
		);

		return JSON.parse(new TextDecoder().decode(decrypted));
	}

	// ================= USER MANAGEMENT =================

	async createUser(userName, password) {

		const keyPair = await crypto.subtle.generateKey(
			{
				name: "ECDSA",
				namedCurve: "P-256"
			},
			true,
			["sign", "verify"]
		);

		// Export private key as JWK for encrypted storage
		const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

		// Export public key as SPKI bytes (serializable for IndexedDB)
		const spkiBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
		const publicKeyBytes = Array.from(new Uint8Array(spkiBuffer));

		const salt = crypto.getRandomValues(new Uint8Array(16));

		const aesKey = await this._deriveAESKey(password, salt);

		const encryptedPrivateKey = await this._encrypt(jwkPrivate, aesKey);

		await this._storeObject("keys", userName, {
			userName,
			encryptedPrivateKey,
			salt: Array.from(salt),
			publicKeyBytes,          // stored as plain byte array
			contacts: [],
			stunServers: [],
			turnServers: [],
			signallingServers: []
		});

		return {
			userName,
			publicKey: keyPair.publicKey   // return live CryptoKey to caller
		};
	}

	async unlockUser(userName, password) {

		const record = await this._getObject("keys", userName);

		if (!record) throw new Error("User not found");

		const salt = new Uint8Array(record.salt);

		const aesKey = await this._deriveAESKey(password, salt);

		const jwkPrivate = await this._decrypt(record.encryptedPrivateKey, aesKey);

		const privateKey = await crypto.subtle.importKey(
			"jwk",
			jwkPrivate,
			{
				name: "ECDSA",
				namedCurve: "P-256"
			},
			false,
			["sign"]
		);

		// Re-import public key from stored SPKI bytes
		const publicKey = await crypto.subtle.importKey(
			"spki",
			new Uint8Array(record.publicKeyBytes),
			{
				name: "ECDSA",
				namedCurve: "P-256"
			},
			true,
			["verify"]
		);

		return {
			userName,
			privateKey,
			publicKey,
			aesKey,
			contacts: record.contacts || [],
			signallingServers: record.signallingServers || []
		};
	}

	// ================= SECURE USER DATA =================

	async storeUserData(userName, aesKey, data) {

		const encryptedData = await this._encrypt(data, aesKey);

		await this._storeObject("secureData", userName, encryptedData);
	}

	async loadUserData(userName, aesKey) {

		const record = await this._getObject("secureData", userName);

		if (!record) return null;

		return this._decrypt(record, aesKey);
	}

	// ================= CONTACT MANAGEMENT =================

	async addContact(userName, contact) {

		const record = await this._getObject("keys", userName);

		if (!record) throw new Error("User not found");

		record.contacts = record.contacts || [];

		record.contacts.push({
			...contact,
			signalingServers: contact.signalingServers || []
		});

		await this._storeObject("keys", userName, record);
	}

	async getContacts(userName) {

		const record = await this._getObject("keys", userName);

		if (!record) throw new Error("User not found");

		record.contacts = record.contacts || [];

		let changed = false;

		record.contacts.forEach(contact => {

			// Migrate old format
			if (contact.signalingServerURL && !contact.signalingServers) {
				contact.signalingServers = [contact.signalingServerURL];
				delete contact.signalingServerURL;
				changed = true;
			}

			if (!contact.signalingServers) {
				contact.signalingServers = [];
				changed = true;
			}
		});

		if (changed) {
			await this._storeObject("keys", userName, record);
		}

		return record.contacts;
	}

	async deleteContact(userName, contactUserName) {

		const record = await this._getObject("keys", userName);

		if (!record) throw new Error("User not found");

		record.contacts = (record.contacts || []).filter(
			c => c.userName !== contactUserName
		);

		await this._storeObject("keys", userName, record);
	}

	async updateContact(userName, contactUserName, updates) {

		const record = await this._getObject("keys", userName);

		if (!record) throw new Error("User not found");

		const index = record.contacts.findIndex(
			c => c.userName === contactUserName
		);

		if (index === -1) throw new Error("Contact not found");

		record.contacts[index] = {
			...record.contacts[index],
			...updates,
			// Preserve existing signalingServers if not explicitly provided in updates
			signalingServers:
				updates.signalingServers ?? record.contacts[index].signalingServers ?? []
		};

		await this._storeObject("keys", userName, record);

		return record.contacts[index];
	}

	async addContactSignalingServer(userName, contactUserName, serverURL) {

		const record = await this._getObject("keys", userName);

		const contact = record.contacts.find(c => c.userName === contactUserName);

		if (!contact) throw new Error("Contact not found");

		contact.signalingServers = contact.signalingServers || [];

		if (!contact.signalingServers.includes(serverURL)) {
			contact.signalingServers.push(serverURL);
		}

		await this._storeObject("keys", userName, record);

		return contact;
	}

	async removeContactSignalingServer(userName, contactUserName, serverURL) {

		const record = await this._getObject("keys", userName);

		const contact = record.contacts.find(c => c.userName === contactUserName);

		if (!contact) throw new Error("Contact not found");

		contact.signalingServers = (contact.signalingServers || []).filter(
			url => url !== serverURL
		);

		await this._storeObject("keys", userName, record);

		return contact;
	}

	async getContactSignalingServers(userName, contactUserName) {

		const record = await this._getObject("keys", userName);

		const contact = record.contacts.find(c => c.userName === contactUserName);

		if (!contact) throw new Error("Contact not found");

		return contact.signalingServers || [];
	}

	// ================= USERNAME MANAGEMENT =================

	async updateUsername(oldName, newName) {

		const user = await this._getObject("keys", oldName);

		if (!user) throw new Error("User not found");

		const db = await this._openDB();

		const tx = db.transaction("keys", "readwrite");

		const store = tx.objectStore("keys");

		user.userName = newName;

		store.delete(oldName);
		store.put(user, newName);

		await new Promise((resolve, reject) => {
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});

		return user;
	}

	// ================= STUN SERVERS =================

	async addStunServer(userName, stunUrl) {

		const record = await this._getObject("keys", userName);

		record.stunServers = record.stunServers || [];

		if (!record.stunServers.includes(stunUrl)) {
			record.stunServers.push(stunUrl);
		}

		await this._storeObject("keys", userName, record);
	}

	async getStunServers(userName) {

		const record = await this._getObject("keys", userName);

		return record.stunServers || [];
	}

	async deleteStunServer(userName, stunUrl) {

		const record = await this._getObject("keys", userName);

		record.stunServers = (record.stunServers || []).filter(s => s !== stunUrl);

		await this._storeObject("keys", userName, record);
	}

	// ================= TURN SERVERS =================

	async addTurnServer(userName, turnServer) {

		const record = await this._getObject("keys", userName);

		record.turnServers = record.turnServers || [];

		record.turnServers.push(turnServer);

		await this._storeObject("keys", userName, record);
	}

	async getTurnServers(userName) {

		const record = await this._getObject("keys", userName);

		return record.turnServers || [];
	}

	async deleteTurnServer(userName, serverUrl) {

		const record = await this._getObject("keys", userName);

		record.turnServers = (record.turnServers || []).filter(
			s => s.url !== serverUrl
		);

		await this._storeObject("keys", userName, record);
	}

	// ================= SIGNALLING SERVERS =================

	async addSignallingServer(userName, url, owner = "manual") {

		const record = await this._getObject("keys", userName);

		record.signallingServers = record.signallingServers || [];

		const exists = record.signallingServers.find(s => s.url === url);

		if (!exists) {
			record.signallingServers.push({ url, owner });
		}

		await this._storeObject("keys", userName, record);
	}

	async getSignallingServers(userName) {

		const record = await this._getObject("keys", userName);

		return record.signallingServers || [];
	}

	async deleteSignallingServer(userName, url) {

		const record = await this._getObject("keys", userName);

		record.signallingServers = (record.signallingServers || []).filter(
			s => s.url !== url
		);

		await this._storeObject("keys", userName, record);
	}

	async setActiveSignallingServer(userName, url) {

		const record = await this._getObject("keys", userName);

		record.activeSignallingServer = url;

		await this._storeObject("keys", userName, record);
	}

	async getActiveSignallingServer(userName) {

		const record = await this._getObject("keys", userName);

		return record.activeSignallingServer || null;
	}

	async updateContactSignalingServer(userName, contactUserName, serverURL) {
		const record = await this._getObject("keys", userName);
		if (!record) throw new Error("User not found");

		const contact = record.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");

		if (serverURL === null) {
			// Remove the signalingServerURL entirely
			delete contact.signalingServerURL;
			contact.signalingServers = (contact.signalingServers || []);
		} else {
			contact.signalingServerURL = serverURL;
			contact.signalingServers = contact.signalingServers || [];
			if (!contact.signalingServers.includes(serverURL)) {
				contact.signalingServers.push(serverURL);
			}
		}

		await this._storeObject("keys", userName, record);
		return contact;
	}


	// ================= SERVER ACCESS CONTROL =================

	async requestSignallingServerAccess(userName, serverUrl) {

		const record = await this._getObject("keys", userName);

		record.signallingServerAccess = record.signallingServerAccess || {};

		record.signallingServerAccess[serverUrl] = {
			requested: true,
			revoked: false,
			requestedAt: Date.now()
		};

		await this._storeObject("keys", userName, record);
	}

	async revokeSignallingServerAccess(userName, serverUrl) {

		const record = await this._getObject("keys", userName);

		record.signallingServerAccess = record.signallingServerAccess || {};

		record.signallingServerAccess[serverUrl] = {
			requested: false,
			revoked: true,
			revokedAt: Date.now()
		};

		await this._storeObject("keys", userName, record);
	}

	async getSignallingServerAccessStatus(userName, serverUrl) {

		const record = await this._getObject("keys", userName);

		const access = record.signallingServerAccess?.[serverUrl];

		if (!access) {
			return { requested: false, revoked: false };
		}

		return access;
	}

	// ================= PUBLIC KEY EXPORT =================

	// Accepts a live CryptoKey object
	async exportPublicKeyToPEM(publicKey) {

		const exported = await crypto.subtle.exportKey("spki", publicKey);

		const base64 = btoa(
			String.fromCharCode(...new Uint8Array(exported))
		);

		const pem = `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;

		return pem;
	}

	// Accepts a live CryptoKey object — returns base64 SPKI string
	// (this is what the signaling server expects in /register and /auth/challenge)
	async exportPublicKeyToBase64(publicKey) {

		const exported = await crypto.subtle.exportKey("spki", publicKey);

		return btoa(String.fromCharCode(...new Uint8Array(exported)));
	}

	// Re-import a public key from stored bytes (useful after loading from IndexedDB)
	async importPublicKeyFromBytes(publicKeyBytes) {

		return crypto.subtle.importKey(
			"spki",
			new Uint8Array(publicKeyBytes),
			{
				name: "ECDSA",
				namedCurve: "P-256"
			},
			true,
			["verify"]
		);
	}
}