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
  async createUser(userId, password) {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await this._deriveAESKey(password, salt);
    const encryptedPrivateKey = await this._encrypt(jwkPrivate, aesKey);

    await this._storeObject("keys", userId, {
      encryptedPrivateKey,
      salt: Array.from(salt),
      publicKey: keyPair.publicKey,
    });

	  console.log("User created");
    return { userId, publicKey: keyPair.publicKey };
  }

  // ---------------- Unlock user identity ----------------
  async unlockUser(userId, password) {
    const record = await this._getObject("keys", userId);
    if (!record) throw new Error("User not found");

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

    return { userId, privateKey, publicKey: record.publicKey, aesKey };
  }

  // ---------------- Store encrypted user data ----------------
  async storeUserData(userId, aesKey, data) {
    const encryptedData = await this._encrypt(data, aesKey);
    await this._storeObject("secureData", userId, encryptedData);
  }

  async loadUserData(userId, aesKey) {
    const record = await this._getObject("secureData", userId);
    if (!record) return null;
    return this._decrypt(record, aesKey);
  }
}
