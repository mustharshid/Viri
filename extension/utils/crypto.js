/**
 * Local Cryptographic Utility (AES-256-GCM)
 * 
 * Used within the extension bridge to decrypt TOTP seeds stored locally.
 * Zero-knowledge architecture: Secrets NEVER leave the terminal.
 */

/**
 * Decrypts data using AES-GCM
 * @param {ArrayBuffer} encryptedData - The encrypted payload.
 * @param {CryptoKey} key - The local hardware key.
 * @param {Uint8Array} iv - The initialization vector.
 * @returns {Promise<string>} The decrypted string (e.g., TOTP seed).
 */
export async function decryptData(encryptedData, key, iv) {
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encryptedData
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error("[Viri Crypto] Decryption failed:", err);
    throw new Error("Local credential decryption failed.");
  }
}

// Stubs for TOTP generation
export function generateTOTP(seed) {
  // Uses RFC 6238 compliant logic.
  // Stub implementation for now.
  return "123456"; 
}
