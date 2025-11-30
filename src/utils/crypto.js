// Step 2: Generate ECDH Key Pair for shared secret
async function generateECDHKeys() {
	return await crypto.subtle.generateKey(
		{
			name: "ECDH",
			namedCurve: "P-256",
		},
		false, // Extractable
		["deriveKey", "deriveBits"]
	);
}

// Step 4: Derive shared secret from ECDH public and private keys
async function deriveSharedSecret(privateKey, publicKey) {
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
async function importAESKey(sharedSecret) {
	return await crypto.subtle.importKey(
		"raw", // Format
		sharedSecret, // Shared secret
		{ name: "AES-GCM", length: 256 }, // AES-GCM key with 256 bits
		false, // Not extractable
		["encrypt", "decrypt"] // Usages: encrypt and decrypt
	);
}

// Step 6: Encrypt data with AES-GCM
async function encryptAES(data, aesKey) {
	const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate random IV (12 bytes)
	const encrypted = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv, // Initialization Vector
		},
		aesKey, // AES Key
		new TextEncoder().encode(data) // Data to encrypt
	);
	return { iv, encrypted };
}

// Step 7: Decrypt data with AES-GCM
async function decryptAES(encryptedData, aesKey, iv) {
	try {
		const decrypted = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: iv,
			},
			aesKey,
			encryptedData
		);
		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (e) {
		console.error("Decryption failed", e);
	}
}
