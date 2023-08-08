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
  lastSeen: [bigint, number],
  msgSince: [bigint, number]
) {
  if (msgSince[0] < lastSeen[0]) {
    return true;
  } else if (msgSince[0] == lastSeen[0]) {
    return msgSince[1] <= lastSeen[1];
  } else {
    return false;
  }
}
