import zlib from 'zlib';
import fs from 'fs';

/**
 * Just enough PNG to read an alpha channel, using Node's own zlib.
 *
 * Deliberately NOT a library: the only dependency that could do this is
 * transitive here, and its types are not installable offline. These files are
 * ours and are all 8-bit RGBA, non-interlaced, so the general cases (palettes,
 * 16-bit, interlacing) are asserted against rather than handled.
 */
export type Pixel = { r: number; g: number; b: number; a: number };

export function readRgba(file: string): Pixel[] {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);

  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];

  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        throw new Error(`${file}: expected 8-bit RGBA non-interlaced, got depth=${depth} colour=${colour} interlace=${interlace}`);
      }
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len; // length + type + data + crc
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const BPP = 4;
  const stride = width * BPP;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec §9.2).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= BPP ? out[y * stride + x - BPP] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= BPP && y > 0 ? out[(y - 1) * stride + x - BPP] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`${file}: unknown scanline filter ${filter}`);
      }
      out[y * stride + x] = (line[x] + add) & 0xff;
    }
  }

  const pixels: Pixel[] = new Array(width * height);
  for (let i = 0; i < width * height; i++) {
    pixels[i] = { r: out[i * 4], g: out[i * 4 + 1], b: out[i * 4 + 2], a: out[i * 4 + 3] };
  }
  return pixels;
}
