import crypto from 'k6/crypto';

export function uuidv4() {
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(crypto.randomBytes(16));

  // Per RFC 4122:
  // - Set version to 4 (bits 12–15 of time_hi_and_version)
  // - Set variant to 10xx (bits 6–7 of clock_seq_hi_and_reserved)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const byteToHex = [];
  for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 0x100).toString(16).slice(1));
  }
  return (byteToHex[bytes[0]] +
        byteToHex[bytes[1]] +
        byteToHex[bytes[2]] +
        byteToHex[bytes[3]] +
        '-' +
        byteToHex[bytes[4]] +
        byteToHex[bytes[5]] +
        '-' +
        byteToHex[bytes[6]] +
        byteToHex[bytes[7]] +
        '-' +
        byteToHex[bytes[8]] +
        byteToHex[bytes[9]] +
        '-' +
        byteToHex[bytes[10]] +
        byteToHex[bytes[11]] +
        byteToHex[bytes[12]] +
        byteToHex[bytes[13]] +
        byteToHex[bytes[14]] +
        byteToHex[bytes[15]]).toLowerCase();
}
