const CRC_TABLE = createCrcTable();

export async function createZipBlob(entries, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const encodedEntries = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeUtf8(normalizeZipPath(entry.path));
    const data = await entryToBytes(entry.data);
    const crc = crc32(data);
    const dos = dateToDos(now);
    const localHeader = createLocalHeader({ nameBytes, data, crc, dos });

    encodedEntries.push({
      nameBytes,
      data,
      crc,
      dos,
      localHeader,
      offset,
    });
    offset += localHeader.length + data.length;
  }

  const centralDirectory = encodedEntries.map((entry) => createCentralDirectoryHeader(entry));
  const centralSize = sumLengths(centralDirectory);
  const end = createEndOfCentralDirectory({
    entryCount: encodedEntries.length,
    centralSize,
    centralOffset: offset,
  });
  const parts = [];

  for (const entry of encodedEntries) {
    parts.push(entry.localHeader, entry.data);
  }
  parts.push(...centralDirectory, end);

  return new Blob(parts, { type: "application/zip" });
}

export function normalizeZipPath(path) {
  return String(path)
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

async function entryToBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (typeof data === "string") return encodeUtf8(data);
  return encodeUtf8(JSON.stringify(data, null, 2));
}

function createLocalHeader({ nameBytes, data, crc, dos }) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  let offset = 0;
  offset = writeUint32(view, offset, 0x04034b50);
  offset = writeUint16(view, offset, 20);
  offset = writeUint16(view, offset, 0x0800);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, dos.time);
  offset = writeUint16(view, offset, dos.date);
  offset = writeUint32(view, offset, crc);
  offset = writeUint32(view, offset, data.length);
  offset = writeUint32(view, offset, data.length);
  offset = writeUint16(view, offset, nameBytes.length);
  offset = writeUint16(view, offset, 0);
  new Uint8Array(buffer, offset).set(nameBytes);
  return new Uint8Array(buffer);
}

function createCentralDirectoryHeader(entry) {
  const buffer = new ArrayBuffer(46 + entry.nameBytes.length);
  const view = new DataView(buffer);
  let offset = 0;
  offset = writeUint32(view, offset, 0x02014b50);
  offset = writeUint16(view, offset, 20);
  offset = writeUint16(view, offset, 20);
  offset = writeUint16(view, offset, 0x0800);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, entry.dos.time);
  offset = writeUint16(view, offset, entry.dos.date);
  offset = writeUint32(view, offset, entry.crc);
  offset = writeUint32(view, offset, entry.data.length);
  offset = writeUint32(view, offset, entry.data.length);
  offset = writeUint16(view, offset, entry.nameBytes.length);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, 0);
  offset = writeUint32(view, offset, 0);
  offset = writeUint32(view, offset, entry.offset);
  new Uint8Array(buffer, offset).set(entry.nameBytes);
  return new Uint8Array(buffer);
}

function createEndOfCentralDirectory({ entryCount, centralSize, centralOffset }) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  let offset = 0;
  offset = writeUint32(view, offset, 0x06054b50);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, 0);
  offset = writeUint16(view, offset, entryCount);
  offset = writeUint16(view, offset, entryCount);
  offset = writeUint32(view, offset, centralSize);
  offset = writeUint32(view, offset, centralOffset);
  writeUint16(view, offset, 0);
  return new Uint8Array(buffer);
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function encodeUtf8(value) {
  return new TextEncoder().encode(value);
}

function sumLengths(parts) {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function dateToDos(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}
