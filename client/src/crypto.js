/**
 * CipherLink — Browser-side E2EE Crypto Module
 * RSA-OAEP (key wrapping) + AES-256-GCM (message encryption)
 * Each message wraps the AES key twice: once for sender, once for recipient.
 * Server NEVER sees plaintext or private keys.
 */

const STORAGE_KEY = "cipherlink_private_jwk";

/* ─── Key Generation ─── */
export async function generateIdentityKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/* ─── Key Export/Import ─── */
export async function exportPublicJwk(publicKey) {
  return crypto.subtle.exportKey("jwk", publicKey);
}

export async function exportPrivateJwk(privateKey) {
  return crypto.subtle.exportKey("jwk", privateKey);
}

export function savePrivateKeyLocal(jwk) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
}

export function loadPrivateKeyJwk() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

export async function importPublicKeyFromJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

/* ─── Encoding Helpers ─── */
function bufToB64(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Encrypt a message with AES-256-GCM, wrap AES key for both sender + recipient.
 * @param {string} text plaintext message
 * @param {CryptoKey} senderPublicKey
 * @param {CryptoKey} recipientPublicKey
 * @returns {object} envelope {iv, ciphertext, wrappedKeySender, wrappedKeyRecipient}
 */
export async function encryptMessageEnvelope(text, senderPublicKey, recipientPublicKey) {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plain
  );
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);

  const wrappedRecipient = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAes
  );
  const wrappedSender = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderPublicKey,
    rawAes
  );

  return {
    iv: bufToB64(iv.buffer),
    ciphertext: bufToB64(ciphertext),
    wrappedKeyRecipient: bufToB64(wrappedRecipient),
    wrappedKeySender: bufToB64(wrappedSender),
  };
}

/**
 * Decrypt a message envelope.
 * @param {object} envelope
 * @param {number} senderUserId
 * @param {number} myUserId
 * @param {CryptoKey} privateKey
 * @returns {string} plaintext
 */
export async function decryptMessageEnvelope(envelope, senderUserId, myUserId, privateKey) {
  const iv = new Uint8Array(b64ToBuf(envelope.iv));
  const ciphertext = b64ToBuf(envelope.ciphertext);
  const wrappedB64 =
    Number(senderUserId) === Number(myUserId)
      ? envelope.wrappedKeySender
      : envelope.wrappedKeyRecipient;
  const wrapped = b64ToBuf(wrappedB64);

  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, wrapped);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
