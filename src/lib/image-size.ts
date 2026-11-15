/** Reads image dimensions from the first bytes of a file, without decoding it. */

/** Width, height and format from the first bytes of a WebP, PNG or JPEG file. */
export function headerSize(b: Buffer): { width: number; height: number; format: string } | null {
  if (b.length < 30) return null;
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    const chunk = b.toString("latin1", 12, 16);
    if (chunk === "VP8X")
      return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), format: "webp" };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), format: "webp" };
    }
    if (chunk === "VP8 ")
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, format: "webp" };
    return null;
  }
  if (b.readUInt32BE(0) === 0x89504e47 && b.toString("latin1", 12, 16) === "IHDR")
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), format: "png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    // Walk the JPEG markers to the frame header (SOF0-SOF15, except DHT/JPG/DAC).
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), format: "jpeg" };
      i += 2 + len;
    }
  }
  return null;
}
