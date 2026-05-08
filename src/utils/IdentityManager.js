import { exportECDSAPrivateKey, exportECDSAPublicKey, importECDSAPrivateKey, importECDSAPublicKey } from "./crypto";

export class IdentityManager {

	constructor(dbName = "UserDataDB") {
		this.dbName = dbName;
	}

	// ================= DB HELPERS =================

	async _openDB() {

		return new Promise((resolve, reject) => {

			const request =
				indexedDB.open(this.dbName, 1);

			request.onupgradeneeded = (e) => {

				const db = e.target.result;
				if (!db.objectStoreNames.contains("userData")) db.createObjectStore("userData");
			};

			request.onsuccess = () =>
				resolve(request.result);

			request.onerror = () =>
				reject(request.error);
		});
	}

	async _storeObject(storeName, key, value) {

		const db = await this._openDB();

		return new Promise((resolve, reject) => {

			const tx =
				db.transaction(storeName, "readwrite");

			tx.objectStore(storeName)
				.put(value, key);

			tx.oncomplete = () => resolve();

			tx.onerror = () =>
				reject(tx.error);
		});
	}

	async _getObject(storeName, key) {

		const db = await this._openDB();

		return new Promise((resolve, reject) => {

			const tx =
				db.transaction(storeName, "readonly");

			const request =
				tx.objectStore(storeName).get(key);

			request.onsuccess = () =>
				resolve(request.result || null);

			request.onerror = () =>
				reject(request.error);
		});
	}

	// ================= KEY DERIVATION =================

	async _deriveAESKey(password, salt) {

		const pwKey =
			await crypto.subtle.importKey(
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

	async encryptWithPassphrase(obj, password) {

		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const aesKey = await this._deriveAESKey(password, salt);

		const enc = new TextEncoder();
		const data = enc.encode(JSON.stringify(obj));

		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			aesKey,
			data
		);

		return {
			salt: Array.from(salt),
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(ciphertext))
		};
	}

	async decryptWithPassphrase(encrypted, password) {
		const salt = new Uint8Array(encrypted.salt);
		const iv = new Uint8Array(encrypted.iv);
		const data = new Uint8Array(encrypted.data);

		const aesKey = await this._deriveAESKey(password, salt);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			aesKey,
			data
		);

		const dec = new TextDecoder();
		return JSON.parse(dec.decode(decrypted));
	}


	//async _encrypt(data, aesKey) {
	//	const iv = crypto.getRandomValues(new Uint8Array(12));
	//	const ciphertext = await crypto.subtle.encrypt(
	//		{ name: "AES-GCM", iv },
	//		aesKey,
	//		new TextEncoder().encode(JSON.stringify(data))
	//	);
	//	return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
	//}

	//async _decrypt(encrypted, aesKey) {
	//	const iv = new Uint8Array(encrypted.iv);
	//	const ciphertext = new Uint8Array(encrypted.ciphertext);
	//	const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
	//	return JSON.parse(new TextDecoder().decode(decrypted));
	//}

	// ---------------- Create new user identity ----------------
	async createUser(userName, password) {
		if (this.userData) throw new Error("Can't create new user using IdentityManager holding other user's data");

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
			signallingServers: []
		};
		this.password = password;

		await this.storeEncryptedUserData();

		console.log("User created");
	}

	// ---------------- Unlock user identity ----------------
	async unlockUser(userName, password) {
		if (this.userData) throw new Error("Double unlock using same IdentityManager not possible");

		const record = await this._getObject("userData", userName);
		if (!record) throw new Error("User not found");

		this.userData = await this.decryptWithPassphrase(record, password);
		this.password = password;
	}

	// lock user data
	async storeEncryptedUserData() {
		const encryptedData = await this.encryptWithPassphrase(this.userData, this.password);
		await this._storeObject("userData", this.userData.userName, encryptedData);
	}


	// ================= CONTACT MANAGEMENT =================

	// Add a contact for the given user
	async addContact(contact) {
		this.userData.contacts.push(contact);

		await this.storeEncryptedUserData();
	}

	// Get contacts for a given user
	getContacts() {
		return this.userData.contacts;
	}

	// Delete a contact
	async deleteContact(contactUserName) {
		this.userData.contacts = this.userData.contacts.filter(
			(c) => c.userName !== contactUserName
		);

		await this.storeEncryptedUserData();
	}

	async updateContact(contactUserName, updates) {

		const contactIndex = this.userData.contacts.findIndex(c => c.userName === contactUserName);
		if (contactIndex === -1) throw new Error("Contact not found");

		this.userData.contacts[contactIndex] = {
			...this.userData.contacts[contactIndex],
			...updates
		};

		await this.storeEncryptedUserData();
		return this.userData.contacts[contactIndex];
	}

	async addContactSignallingServer(contactUserName, serverURL) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");

		if (contact.signallingServers.includes(serverURL)) throw new Error("Signaling server already exists for this contact");
		contact.signallingServers.push(serverURL)
		await this.storeEncryptedUserData();
	}

	async removeContactSignallingServer(contactUserName, serverURL) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);
		if (!contact) throw new Error("Contact not found");

		if (!contact.signallingServers.includes(serverURL)) throw new Error("Signaling server doesn't exist for this contact");

		contact.signallingServers = contact.signallingServers.filter(x => x !== serverURL);

		await this.storeEncryptedUserData();
	}

	// Get signaling server for a specific contact
	async getContactSignallingServers(contactUserName) {
		const contact = this.userData.contacts.find(c => c.userName === contactUserName);

		if (!contact)
			throw new Error("Contact not found");

		return contact.signallingServers;
	}

	// ============ USERNAME MANAGEMENT ============

	getUserName() {
		return this.userData.userName;
	}

	async updateUsername(newName) {
		const db = await this._openDB()
		const tx = db.transaction("userData", "readwrite")
		const store = tx.objectStore("userData")


		store.delete(this.userData.userName)

		this.userData.userName = newName;

		await this.storeEncryptedUserData();

		await new Promise((resolve, reject) => {

			tx.oncomplete = resolve;

			tx.onerror = () =>
				reject(tx.error);
		});
	}


	// Key management
	getPublicKey() {
		return this.userData.publicKey;
	}

	getPrivateKey() {
		return this.userData.privateKey;
	}

	// ================= STUN SERVERS =================

	async addStunServer(stunUrl) {
		if (!this.userData.stunServers.includes(stunUrl)) {
			this.userData.stunServers.push(stunUrl);
			await this.storeEncryptedUserData();
		}
	}

	getStunServers() {
		return this.userData.stunServers;
	}

	async deleteStunServer(stunUrl) {
		this.userData.stunServers = this.userData.stunServers.filter(
			(s) => s !== stunUrl
		);

		await this.storeEncryptedUserData();
	}

	// ============ TURN SERVER MANAGEMENT ============

	async addTurnServer(turnServer) {
		if (!this.userData.turnServers.includes(turnServer)) {
			this.userData.turnServers.push(turnServer);
			await this.storeEncryptedUserData();
		}
	}

	getTurnServers() {
		return this.userData.turnServers;
	}

	async deleteTurnServer(serverUrl) {

		this.userData.turnServers = this.userData.turnServers.filter(
			(s) => s.url !== serverUrl
		);

		await this.storeEncryptedUserData();
	}

	// ================= SIGNALLING SERVERS =================

	async addSignallingServer(url, own = false) {

		const exists = this.userData.signallingServers.find((server) => server.url === url)

		if (!exists) {
			this.userData.signallingServers.push({
				url,
				token: null,
				own,
			});
			await this.storeEncryptedUserData();
		}
	}

	async setOwnerShipForSignallingServer(url, own = false) {
		const server = this.userData.signallingServers.find((server) => server.url === url);

		if (server) {
			server.own = own;
			await this.storeEncryptedUserData();
		}
	}

	getSignallingServers() {
		return this.userData.signallingServers;
	}

	async deleteSignallingServer(url) {
		this.userData.signallingServers = this.userData.signallingServers.filter(s => s.url !== url);

		await this.storeEncryptedUserData();
	}

	// Set active signaling server for user
	//async setActiveSignallingServer(url) {
	//	this.userData.activeSignallingServer = url;
	//	await this.storeEncryptedUserData();
	//}

	//// Get active signaling server for user
	//getActiveSignallingServer() {
	//	return this.userData.activeSignallingServer;
	//}
}
