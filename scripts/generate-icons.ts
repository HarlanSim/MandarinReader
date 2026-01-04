import * as fs from 'fs';
import * as path from 'path';
import { deflateSync } from 'zlib';

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons');

function createPngBuffer(size: number): Buffer {
  const width = size;
  const height = size;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    const table = new Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(data.length, 0);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);

  const rawData: number[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 2;

  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (dist < radius) {
        rawData.push(74, 144, 217);
      } else {
        rawData.push(255, 255, 255);
      }
    }
  }

  const rawBuffer = Buffer.from(rawData);
  const compressed = deflateSync(rawBuffer);
  const idat = createChunk('IDAT', compressed);

  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function main() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  for (const size of [16, 48, 128]) {
    const buffer = createPngBuffer(size);
    const filepath = path.join(ICONS_DIR, `icon${size}.png`);
    fs.writeFileSync(filepath, buffer);
    console.log(`Created ${filepath}`);
  }

  console.log('Icons generated!');
}

main();
