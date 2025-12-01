// Step 2: Generate ECDH Key Pair for shared secret
export async function generateECDHKeys() {
	return await crypto.subtle.generateKey(
		{
			name: "ECDH",
			namedCurve: "P-256",
		},
		false, // Extractable
		["deriveKey", "deriveBits"]
	);
}

export async function exportKey(key) {
	const exported = await window.crypto.subtle.exportKey("spki", key); // for public key
	const exportedKeyBuffer = new Uint8Array(exported);
	const base64Key = btoa(String.fromCharCode(...exportedKeyBuffer));
	return base64Key;
}

// Step 4: Derive shared secret from ECDH public and private keys
export async function deriveSharedSecret(privateKey, publicKey) {
	const sharedBits = await crypto.subtle.deriveBits(
		{
			name: "ECDH",
			public: publicKey,
		},
		privateKey,
		256 // Generate 256-bit shared secret
	);
	return sharedBits;
}

// Step 5: Import shared secret to create an AES key
export async function importAESKey(sharedSecret) {
	return await crypto.subtle.importKey(
		"raw", // Format
		sharedSecret, // Shared secret
		{ name: "AES-GCM", length: 256 }, // AES-GCM key with 256 bits
		false, // Not extractable
		["encrypt", "decrypt"] // Usages: encrypt and decrypt
	);
}

// Step 6: Encrypt data with AES-GCM
export async function encryptAES(data, aesKey) {
	const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate random IV (12 bytes)
	const encrypted = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv, // Initialization Vector
		},
		aesKey, // AES Key
		data
	);
	return { iv, encrypted };
}

// Step 7: Decrypt data with AES-GCM
export async function decryptAES(encryptedData, aesKey, iv) {
	try {
		const decrypted = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: iv,
			},
			aesKey,
			encryptedData
		);
		return decrypted;
	} catch (e) {
		console.error("Decryption failed", e);
	}
}

// Step 3: Sign the nonce with ECDSA to authenticate the user
export async function signChallenge(privateKey, challenge) {
	const encoder = new TextEncoder();
	const signature = await crypto.subtle.sign(
		{
			name: "ECDSA",
			hash: "SHA-256",
		},
		privateKey,
		challenge
	);
	return signature;
}

export async function verifyChallenge(publicKey, challenge, signature) {
	const encoder = new TextEncoder();

	const isValid = await crypto.subtle.verify(
		{
			name: "ECDSA",
			hash: "SHA-256",
		},
		publicKey,
		signature,
		challenge
	);

	return isValid; // true or false
}

export function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
