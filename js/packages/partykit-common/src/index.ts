export * from "./msgTypes.js";
export { decode } from "./decode.js";
export { encode } from "./encode.js";

export function hexToBytes(hex: string) {
  const ret = new Uint8Array(hex.length / 2);
  for (let c = 0; c < hex.length; c += 2) {
    ret[c / 2] = parseInt(hex.substring(c, c + 2), 16);
  }
  return ret;
}

export function bytesToHex(bytes: Uint8Array) {
  let hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    let current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex.push((current >>> 4).toString(16));
    hex.push((current & 0xf).toString(16));
  }
  return hex.join("");
}

export function greaterThanOrEqual(
  lastSeen: readonly [bigint, number],
  msgSince: readonly [bigint, number]
) {
  if (msgSince[0] < lastSeen[0]) {
    return true;
  } else if (msgSince[0] == lastSeen[0]) {
    return msgSince[1] <= lastSeen[1];
  } else {
    return false;
  }
}

export function cryb64(str: string, seed: number = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296n * BigInt(h2) + BigInt(h1);
}

export function uintArraysEqual(l: Uint8Array, r: Uint8Array) {
  if (l.length != r.length) {
    return false;
  }

  for (let i = 0; i < l.length; ++i) {
    if (l.at(i) !== r.at(i)) {
      return false;
    }
  }
  return true;
}
