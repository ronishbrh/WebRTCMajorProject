
import { importECDSAPrivateKey } from "../utils/crypto";
export class AuthClient {
	constructor(wsUrl, identity) {
		this.wsUrl = wsUrl;
		this.httpUrl = wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
		this.identity = identity;
	}

	// ─── Token storage (now via IdentityManager → IndexedDB) ─────────────────

	_load() {
		// Synchronous — reads from in-memory userData, already decrypted
		return this.identity.getSignallingServerTokens(this.wsUrl);
	}

	async _save(tokens) {
		await this.identity.setSignallingServerTokens(this.wsUrl, tokens);
	}

	async _clear() {
		await this.identity.clearSignallingServerTokens(this.wsUrl);
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	async getValidToken() {
		const stored = this._load();

		if (stored?.accessToken && !this._isExpiredOrClose(stored.accessToken)) {
			return stored.accessToken;
		}

		if (stored?.refreshToken && !this._isExpiredOrClose(stored.refreshToken)) {
			return this._refreshAccessToken(stored.refreshToken);
		}

		return this._challengeResponse();
	}

	async authenticate() {
		const token = await this._challengeResponse();
		return token ? this._load() : null;
	}

	async revokeAccess() {
		const stored = this._load();
		if (!stored?.accessToken) return;

		const res = await fetch(`${this.httpUrl}/admin/remove`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${stored.accessToken}`,
			},
			body: JSON.stringify({ publicKey: this.identity.getPublicKey() }),
		});

		await this._clear();
		if (res.status === 403) throw new Error("Server rejected revocation (forbidden)");
		if (!res.ok) throw new Error(`Revocation failed: ${await res.text()}`);
	}

	async checkStatus() {
		const stored = this._load();
		if (!stored?.accessToken) return "unknown";
		try {
			const res = await fetch(`${this.httpUrl}/auth/status`, {
				headers: { Authorization: `Bearer ${stored.accessToken}` },
			});
			if (res.status === 401) return "unknown";
			const data = await res.json();
			return data.approved ? "approved" : "pending";
		} catch {
			return "unknown";
		}
	}

	clearTokens() {
		return this._clear(); // returns a Promise
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	_decodePayload(token) {
		try {
			const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
			return JSON.parse(atob(base64));
		} catch {
			return null;
		}
	}

	_isExpiredOrClose(token) {
		const payload = this._decodePayload(token);
		if (!payload?.exp) return true;
		return payload.exp - 60 < Date.now() / 1000;
	}

	async _challengeResponse() {
		const pubKey = this.identity.getPublicKey();

		const challengeRes = await fetch(`${this.httpUrl}/auth/challenge`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ publicKey: pubKey }),
		});
		if (!challengeRes.ok) throw new Error("Challenge request failed");
		const { nonce } = await challengeRes.json();

		const privateKey = await importECDSAPrivateKey(this.identity.getPrivateKey());
		const rawSig = await crypto.subtle.sign(
			{ name: "ECDSA", hash: { name: "SHA-256" } },
			privateKey,
			new TextEncoder().encode(nonce)
		);
		const signature = btoa(String.fromCharCode(...new Uint8Array(rawSig)));

		const verifyRes = await fetch(`${this.httpUrl}/auth/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ publicKey: pubKey, signature }),
		});

		if (verifyRes.status === 403) {
			const body = await verifyRes.json().catch(() => ({}));
			if (body.error === "pending" || body.error === "not_registered") return null;
			throw new Error("Not approved");
		}
		if (!verifyRes.ok) throw new Error(`Auth failed: ${await verifyRes.text()}`);

		const { accessToken, refreshToken, isAdmin } = await verifyRes.json();
		await this._save({ accessToken, refreshToken, isAdmin }); // ← now async
		return accessToken;
	}

	async _refreshAccessToken(refreshToken) {
		const res = await fetch(`${this.httpUrl}/auth/refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refreshToken }),
		});

		if (!res.ok) {
			await this._clear();
			return this._challengeResponse();
		}

		const { accessToken, refreshToken: newRefresh, isAdmin } = await res.json();
		await this._save({ accessToken, refreshToken: newRefresh, isAdmin }); // ← now async
		return accessToken;
	}
}