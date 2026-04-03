#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# Build extension
pnpm --filter @claude-studio/extension build

# Create dist directory
mkdir -p dist

# Create ZIP using Node.js (no external zip dependency)
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = 'packages/extension/build/chrome-mv3-prod';
const outFile = 'dist/claude-studio-extension.zip';

// Use tar + gzip as fallback, but prefer creating a proper zip with node
// We'll use the built-in zlib to create a simple zip file

function walkDir(dir, base) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(base, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath, relPath));
    } else {
      entries.push({ path: relPath, data: fs.readFileSync(fullPath) });
    }
  }
  return entries;
}

// Minimal ZIP file creator
function createZip(files) {
  const centralDir = [];
  const localFiles = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.path.replace(/\\\\/g, '/'));
    const data = file.data;

    // CRC32
    const crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);  // version needed
    local.writeUInt16LE(0, 6);   // flags
    local.writeUInt16LE(0, 8);   // compression (store)
    local.writeUInt16LE(0, 10);  // mod time
    local.writeUInt16LE(0, 12);  // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(local, 30);

    localFiles.push(local, data);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);  // version made by
    central.writeUInt16LE(20, 6);  // version needed
    central.writeUInt16LE(0, 8);   // flags
    central.writeUInt16LE(0, 10);  // compression
    central.writeUInt16LE(0, 12);  // mod time
    central.writeUInt16LE(0, 14);  // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);  // extra length
    central.writeUInt16LE(0, 32);  // comment length
    central.writeUInt16LE(0, 34);  // disk number
    central.writeUInt16LE(0, 36);  // internal attrs
    central.writeUInt32LE(0, 38);  // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    nameBytes.copy(central, 46);

    centralDir.push(central);
    offset += local.length + data.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);  // disk number
  eocd.writeUInt16LE(0, 6);  // disk with CD
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localFiles, centralDirBuf, eocd]);
}

const files = walkDir(srcDir, '');
const zipData = createZip(files);
fs.writeFileSync(outFile, zipData);
console.log('Extension ZIP created: ' + outFile + ' (' + zipData.length + ' bytes, ' + files.length + ' files)');
"
