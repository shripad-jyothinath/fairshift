/**
 * Pure field arithmetic. Safe to import from the browser: no Node built-ins.
 * Semaphore's circuit works over the BN254 scalar field.
 */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Maps a 64-char hex digest into the field, keeping 124 bits. */
export function hashToField(hex: string): bigint {
  return BigInt(`0x${hex.slice(0, 31)}`) % FIELD_MODULUS;
}

/**
 * The proof commits to the report body via this field element.
 * Same function runs in the browser and on the server.
 */
export function messageForBody(bodyHash: string): string {
  return hashToField(bodyHash).toString();
}
