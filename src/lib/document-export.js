// Browser-native document packaging used by report exports.
// No runtime CDN or eval dependency: ZIP uses STORE entries; PDF uses standard Helvetica.

const encoder = new TextEncoder();

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return Promise.resolve(value);
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.arrayBuffer().then(buffer => new Uint8Array(buffer));
  }
  return Promise.resolve(encoder.encode(String(value ?? '')));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
  const day = ((year - 1980) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, date: day };
}

function headerBytes(length) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  return { bytes, view };
}

class ZipRoot {
  constructor() { this.entries = []; }

  file(name, data) {
    this.entries.push({ name: String(name || '').replace(/^\/+/, ''), data });
    return this;
  }

  folder(name) {
    return new ZipFolder(this, String(name || '').replace(/^\/+|\/+$/g, '') + '/');
  }

  async generateAsync({ type = 'blob', mimeType = 'application/zip' } = {}) {
    if (type !== 'blob') throw new Error('ZIP_OUTPUT_UNSUPPORTED');
    const locals = [];
    const centrals = [];
    let localOffset = 0;
    const stamp = dosDateTime();

    for (const entry of this.entries) {
      const name = encoder.encode(entry.name);
      const data = await bytesOf(entry.data);
      const crc = crc32(data);
      const local = headerBytes(30);
      local.view.setUint32(0, 0x04034b50, true);
      local.view.setUint16(4, 20, true);
      local.view.setUint16(6, 0x0800, true);
      local.view.setUint16(8, 0, true);
      local.view.setUint16(10, stamp.time, true);
      local.view.setUint16(12, stamp.date, true);
      local.view.setUint32(14, crc, true);
      local.view.setUint32(18, data.length, true);
      local.view.setUint32(22, data.length, true);
      local.view.setUint16(26, name.length, true);
      local.view.setUint16(28, 0, true);
      const localRecord = concatBytes([local.bytes, name, data]);
      locals.push(localRecord);

      const central = headerBytes(46);
      central.view.setUint32(0, 0x02014b50, true);
      central.view.setUint16(4, 20, true);
      central.view.setUint16(6, 20, true);
      central.view.setUint16(8, 0x0800, true);
      central.view.setUint16(10, 0, true);
      central.view.setUint16(12, stamp.time, true);
      central.view.setUint16(14, stamp.date, true);
      central.view.setUint32(16, crc, true);
      central.view.setUint32(20, data.length, true);
      central.view.setUint32(24, data.length, true);
      central.view.setUint16(28, name.length, true);
      central.view.setUint16(30, 0, true);
      central.view.setUint16(32, 0, true);
      central.view.setUint16(34, 0, true);
      central.view.setUint16(36, 0, true);
      central.view.setUint32(38, 0, true);
      central.view.setUint32(42, localOffset, true);
      centrals.push(concatBytes([central.bytes, name]));
      localOffset += localRecord.length;
    }

    const centralDirectory = concatBytes(centrals);
    const end = headerBytes(22);
    end.view.setUint32(0, 0x06054b50, true);
    end.view.setUint16(4, 0, true);
    end.view.setUint16(6, 0, true);
    end.view.setUint16(8, this.entries.length, true);
    end.view.setUint16(10, this.entries.length, true);
    end.view.setUint32(12, centralDirectory.length, true);
    end.view.setUint32(16, localOffset, true);
    end.view.setUint16(20, 0, true);

    return new Blob([...locals, centralDirectory, end.bytes], { type: mimeType });
  }
}

class ZipFolder {
  constructor(root, prefix) { this.root = root; this.prefix = prefix; }
  file(name, data) { this.root.file(this.prefix + String(name || ''), data); return this; }
  folder(name) { return new ZipFolder(this.root, this.prefix + String(name || '').replace(/^\/+|\/+$/g, '') + '/'); }
}

export function createZipBuilder() {
  return new ZipRoot();
}

function ascii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

function pdfEscape(value) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(value, max) {
  const text = ascii(value).replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) line = next;
    else {
      if (line) lines.push(line);
      line = word.length > max ? word.slice(0, max) : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function reportLines(report, maxChars) {
  const lines = [];
  lines.push({ text: report.title || 'Laporan ProQTrack', size: 14, bold: true });
  lines.push({ text: `Periode: ${report.filters?.start || '-'} s.d. ${report.filters?.end || '-'}`, size: 8 });
  lines.push({ text: `Dibuat: ${new Date(report.generatedAt || Date.now()).toLocaleString('id-ID')}`, size: 8 });
  lines.push({ text: '', size: 5 });
  lines.push({ text: (report.headers || []).map(ascii).join(' | '), size: 7, bold: true });
  for (const row of report.rows || []) {
    const joined = row.map(value => ascii(value)).join(' | ');
    for (const line of wrap(joined, maxChars)) lines.push({ text: line, size: 7 });
  }
  return lines;
}

function makePdfBytes(report) {
  const landscape = (report.headers || []).length > 6;
  const width = landscape ? 842 : 595;
  const height = landscape ? 595 : 842;
  const maxChars = landscape ? 155 : 105;
  const lines = reportLines(report, maxChars);
  const top = height - 34;
  const bottom = 34;
  const lineHeight = 10;
  const perPage = Math.max(1, Math.floor((top - bottom) / lineHeight));
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));

  const pageCount = pages.length || 1;
  const fontNormalId = 3 + pageCount * 2;
  const fontBoldId = fontNormalId + 1;
  const objects = new Map();
  const kids = [];
  for (let i = 0; i < pageCount; i += 1) kids.push(`${3 + i * 2} 0 R`);
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`);

  for (let i = 0; i < pageCount; i += 1) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const commands = [];
    let y = top;
    for (const line of pages[i] || []) {
      const font = line.bold ? 'F2' : 'F1';
      const size = line.size || 7;
      commands.push(`BT /${font} ${size} Tf 32 ${y} Td (${pdfEscape(line.text)}) Tj ET`);
      y -= lineHeight;
    }
    const stream = commands.join('\n');
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  }

  objects.set(fontNormalId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(fontBoldId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const maxId = fontBoldId;
  const chunks = [encoder.encode('%PDF-1.4\n')];
  const offsets = new Array(maxId + 1).fill(0);
  let offset = chunks[0].length;
  for (let id = 1; id <= maxId; id += 1) {
    const chunk = encoder.encode(`${id} 0 obj\n${objects.get(id)}\nendobj\n`);
    offsets[id] = offset;
    chunks.push(chunk);
    offset += chunk.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

export function createPdfBlob(report) {
  return new Blob([makePdfBytes(report)], { type: 'application/pdf' });
}

export const __test = { crc32, dosDateTime, makePdfBytes };
