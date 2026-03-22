
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

export async function exportECDSAPublicKey(key) {
    const exported = await crypto.subtle.exportKey("spki", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function exportECDSAPrivateKey(key) {
    const exported = await crypto.subtle.exportKey("pkcs8", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importECDSAPublicKey(base64) {
    const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
        "spki",
        bin,
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        true,
        ["verify"]
    );
}

export async function importECDSAPrivateKey(base64) {
    const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
        "pkcs8",
        bin,
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        true,
        ["sign"]
    );
}


//ecdh shared scret derive 
export async function deriveSharedSecret(privateKey, publicKey) {
	const sharedBits = await crypto.subtle.deriveBits(
		{
			name: "ECDH",
			public: publicKey,
		},
		privateKey,
		256 
	);
	return sharedBits;
}


export async function importAESKey(sharedSecret) {
	return await crypto.subtle.importKey(
		"raw", // Format
		sharedSecret, // Shared secret
		{ name: "AES-GCM", length: 256 }, 
		false, // Not extractable
		["encrypt", "decrypt"] // Usages: encrypt and decrypt
	);
}


export async function encryptAES(data, aesKey) {
	const iv = crypto.getRandomValues(new Uint8Array(12)); //random IV (12 bytes)
	const encrypted = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv, 
		},
		aesKey, 
		data
	);
	return { iv, encrypted };
}

//with AES-GCM
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

//Sign the nonce with ECDSA to authenticate the user
export async function signChallenge(privateKey, challenge) {
	//const encoder = new TextEncoder();
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
	// If publicKey is a string (base64), import it first
	if (typeof publicKey === 'string') {
		publicKey = await importECDSAPublicKey(publicKey);
		console.log("publicKey string ho raixa hai")
	}

	const isValid = await crypto.subtle.verify(
		{
			name: "ECDSA",
			hash: "SHA-256",
		},
		publicKey,
		signature,
		challenge

	);
	console.log(isValid)
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