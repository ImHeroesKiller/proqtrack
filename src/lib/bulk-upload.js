const TEMPLATE_HEADERS = Object.freeze([
  'employee_code',
  'full_name',
  'email',
  'phone',
  'role',
  'area',
  'position',
  'project_code',
  'supervisor_email',
  'status',
  'create_login',
]);

const HEADER_ALIASES = Object.freeze({
  employee_code: ['employee_code','employee id','employee_id','kode karyawan','kode_karyawan','nik','id karyawan','id_karyawan'],
  full_name: ['full_name','name','nama','nama lengkap','nama_lengkap','nama karyawan','nama_karyawan'],
  email: ['email','email karyawan','email_karyawan'],
  phone: ['phone','telepon','no hp','no_hp','nomor hp','nomor_hp','mobile'],
  role: ['role','peran'],
  area: ['area','wilayah'],
  position: ['position','posisi','jabatan'],
  project_code: ['project_code','project','project id','project_id','kode project','kode_project','nama project','nama_project'],
  supervisor_email: ['supervisor_email','supervisor','email supervisor','email_supervisor'],
  status: ['status','employment_status'],
  create_login: ['create_login','buat login','buat_login','login','create account','create_account'],
});

const normalizeHeader = value => String(value || '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const aliasMap = (() => {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) map.set(normalizeHeader(alias), canonical);
  }
  return map;
})();

export function detectDelimiter(text = '') {
  const line = String(text).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const candidates = [',',';','\t'];
  let best = ',', count = -1;
  for (const candidate of candidates) {
    let current = 0, quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && char === candidate) current += 1;
    }
    if (current > count) { count = current; best = candidate; }
  }
  return best;
}

export function parseDelimited(text = '', delimiter = detectDelimiter(text)) {
  const input = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(value);
      value = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(value);
      value = '';
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function columnIndex(ref = '') {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('XLSX_UNSUPPORTED_BROWSER');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('XLSX_ZIP_INVALID');

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let n = 0; n < total; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('XLSX_DIRECTORY_INVALID');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('XLSX_ENTRY_INVALID');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, { method, compressed });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    async text(name) {
      const entry = entries.get(name);
      if (!entry) return '';
      const raw = entry.method === 0 ? entry.compressed
        : entry.method === 8 ? await inflateRaw(entry.compressed)
          : (() => { throw new Error('XLSX_COMPRESSION_UNSUPPORTED'); })();
      return decoder.decode(raw);
    },
    names: [...entries.keys()],
  };
}

export async function parseXlsx(buffer) {
  if (typeof DOMParser !== 'function') throw new Error('XLSX_UNSUPPORTED_BROWSER');
  const zip = await unzipEntries(buffer);
  const sheetName = zip.names
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error('XLSX_SHEET_NOT_FOUND');

  const sharedXml = await zip.text('xl/sharedStrings.xml');
  const shared = [];
  if (sharedXml) {
    const doc = new DOMParser().parseFromString(sharedXml, 'application/xml');
    for (const si of [...doc.getElementsByTagNameNS('*', 'si')]) {
      shared.push([...si.getElementsByTagNameNS('*', 't')].map(node => node.textContent || '').join(''));
    }
  }

  const sheetXml = await zip.text(sheetName);
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XLSX_XML_INVALID');
  const rows = [];
  for (const rowNode of [...doc.getElementsByTagNameNS('*', 'row')]) {
    const row = [];
    const cells = [...rowNode.childNodes].filter(node => node.nodeType === 1 && node.localName === 'c');
    for (const cell of cells) {
      const index = columnIndex(cell.getAttribute('r') || '');
      const type = cell.getAttribute('t') || '';
      let value = '';
      if (type === 'inlineStr') value = [...cell.getElementsByTagNameNS('*', 't')].map(node => node.textContent || '').join('');
      else {
        const raw = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent || '';
        value = type === 's' ? (shared[Number(raw)] ?? '') : raw;
      }
      row[index] = value;
    }
    rows.push(row.map(value => value ?? ''));
  }
  return rows;
}

export function normalizeRows(matrix = []) {
  if (!matrix.length) return [];
  const headers = matrix[0].map(value => aliasMap.get(normalizeHeader(value)) || '');
  const present = new Set(headers.filter(Boolean));
  for (const required of ['employee_code','full_name','project_code']) {
    if (!present.has(required)) throw new Error(`Kolom wajib tidak ditemukan: ${required}`);
  }

  return matrix.slice(1)
    .filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
    .map((row, index) => {
      const out = { _row_number: index + 2 };
      headers.forEach((key, column) => {
        if (key) out[key] = String(row[column] ?? '').trim();
      });
      return out;
    });
}

export async function parseBulkEmployeeFile(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.xlsx')) return normalizeRows(await parseXlsx(await file.arrayBuffer()));
  const text = await file.text();
  return normalizeRows(parseDelimited(text));
}

export function templateCsv() {
  return '\uFEFF' + TEMPLATE_HEADERS.join(',') + '\n';
}

export const __test = { TEMPLATE_HEADERS, normalizeHeader, columnIndex };
