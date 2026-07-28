import {
  seedEmployees, seedOutlets, seedVisits, seedAttendance, seedAccounts,
  seedProducts, seedLeaveTypes, seedLeaves, seedStocks, seedPriceObservations,
  seedCompetitors, seedCompetitorProducts, seedCompetitorIntel,
  seedPromoTypes, seedFieldPhotos,
} from './data/seed.js';

const DB_KEY = 'proqtrack_db_v6';
const CLIENTS = [
  ['CL001','Nusantara Consumer Goods','NCG','#EF5000'],
  ['CL002','Prima Retail Indonesia','PRI','#2563EB'],
  ['CL003','Mitra Bangunan Sejahtera','MBS','#0F766E'],
  ['CL004','Sari Pangan Nasional','SPN','#7C3AED'],
  ['CL005','Sentra Elektronik Asia','SEA','#0891B2'],
  ['CL006','Kimia Sehat Indonesia','KSI','#DC2626'],
  ['CL007','Arunika Personal Care','APC','#DB2777'],
  ['CL008','Bumi Beverage Group','BBG','#16A34A'],
  ['CL009','Cipta Home Living','CHL','#D97706'],
  ['CL010','Garuda Distribution Network','GDN','#334155'],
];
const PROJECTS = [
  ['PRJ001','Retail Execution Jabodetabek','CL001','Jakarta Pusat'],
  ['PRJ002','Modern Trade Visibility','CL002','Jakarta Selatan'],
  ['PRJ003','Building Material Coverage','CL003','Jakarta Barat'],
  ['PRJ004','Food Service Activation','CL004','Jakarta Timur'],
  ['PRJ005','Electronics Channel Audit','CL005','Tangerang'],
  ['PRJ006','Pharmacy Product Availability','CL006','Bekasi'],
  ['PRJ007','Beauty Advisor Field Program','CL007','Depok'],
  ['PRJ008','Beverage Route-to-Market','CL008','Bogor'],
  ['PRJ009','Home Living Merchandising','CL009','Jakarta Utara'],
  ['PRJ010','National Distributor Compliance','CL010','Jabodetabek'],
];
const FIRST = ['Aditya','Agus','Ahmad','Andi','Anisa','Ardi','Bagas','Bella','Bima','Cahya','Citra','Damar','Dewi','Dian','Dimas','Eka','Farhan','Fajar','Fitri','Galih','Hana','Hendra','Indah','Intan','Joko','Kevin','Laras','Maya','Nadia','Nanda','Putra','Rani','Reza','Rina','Rizky','Salsa','Sari','Siti','Taufik','Vina'];
const LAST = ['Pratama','Santoso','Wijaya','Lestari','Nugroho','Permata','Ramadhan','Saputra','Kusuma','Hidayat','Maulana','Utami','Purnama','Setiawan','Wibowo','Kurniawan','Firmansyah','Mahendra','Syahputra','Anggraini'];
const AREAS = ['Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara','Tangerang','Bekasi','Depok','Bogor','Jabodetabek'];

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function svgData(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function clientLogo(name, initials, color) {
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="64" viewBox="0 0 160 64"><rect width="160" height="64" rx="14" fill="#fff"/><rect x="5" y="5" width="54" height="54" rx="13" fill="${color}"/><text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="800" fill="#fff">${esc(initials)}</text><text x="69" y="29" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#0f172a">${esc(name.split(' ').slice(0,2).join(' '))}</text><text x="69" y="45" font-family="Arial,sans-serif" font-size="9" fill="#64748b">Client Partner</text></svg>`);
}
function employeePhoto(name, index) {
  const palette = ['#EF5000','#2563EB','#0F766E','#7C3AED','#DB2777','#16A34A','#D97706','#0891B2'];
  const skin = ['#F4C7A1','#DDA77B','#C9875C','#A96845'][index % 4];
  const shirt = palette[index % palette.length];
  const initials = name.split(' ').map(x => x[0]).slice(0,2).join('');
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f8fafc"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="63" r="34" fill="${skin}"/><path d="M45 62c3-31 67-42 72 1-15-17-55-18-72-1Z" fill="#263238"/><path d="M28 160c3-41 24-61 52-61s50 20 52 61Z" fill="${shirt}"/><circle cx="68" cy="64" r="3" fill="#263238"/><circle cx="92" cy="64" r="3" fill="#263238"/><path d="M70 81c7 6 14 6 21 0" fill="none" stroke="#8d4f3a" stroke-width="3" stroke-linecap="round"/><circle cx="126" cy="128" r="24" fill="#fff" opacity=".94"/><text x="126" y="135" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="800" fill="${shirt}">${esc(initials)}</text></svg>`);
}
function initialDB() {
  return {
    _version: 6,
    employees: structuredClone(seedEmployees),
    outlets: structuredClone(seedOutlets),
    visits: structuredClone(seedVisits),
    attendance: structuredClone(seedAttendance),
    accounts: structuredClone(seedAccounts),
    products: structuredClone(seedProducts),
    leaveTypes: structuredClone(seedLeaveTypes),
    leaves: structuredClone(seedLeaves),
    stocks: structuredClone(seedStocks),
    priceObservations: structuredClone(seedPriceObservations),
    competitors: structuredClone(seedCompetitors),
    competitorProducts: structuredClone(seedCompetitorProducts),
    competitorIntel: structuredClone(seedCompetitorIntel),
    promoTypes: structuredClone(seedPromoTypes),
    fieldPhotos: structuredClone(seedFieldPhotos),
  };
}
function readDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || 'null') || initialDB(); } catch { return initialDB(); }
}
function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (error) { console.warn('Phase 0 dummy enrichment skipped:', error); }
}
function buildEmployees(existing) {
  const rows = Array.isArray(existing) ? [...existing] : [];
  const used = new Set(rows.map(x => x.id));
  for (let i = 0; i < rows.length; i++) {
    const client = CLIENTS[i % CLIENTS.length];
    const project = PROJECTS[i % PROJECTS.length];
    rows[i] = { ...rows[i], clientId: rows[i].clientId || client[0], projectId: rows[i].projectId || project[0], photo: rows[i].photo || employeePhoto(rows[i].name || `Employee ${i+1}`, i) };
  }
  for (let i = rows.length; i < 100; i++) {
    const n = i + 1;
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const client = CLIENTS[i % CLIENTS.length];
    const project = PROJECTS[i % PROJECTS.length];
    const id = `EMP${String(n).padStart(3,'0')}`;
    if (used.has(id)) continue;
    rows.push({
      id, name,
      email: `${name.toLowerCase().replace(/\s+/g,'.')}@proqtrack.id`,
      phone: `0812-${String(3400 + i).padStart(4,'0')}-${String(7000 + i).padStart(4,'0')}`,
      role: i % 10 === 0 ? 'Supervisor' : 'Field Sales',
      area: AREAS[i % AREAS.length],
      status: i % 17 === 0 ? 'inactive' : 'active',
      lat: -6.12 - ((i % 12) * .012),
      lng: 106.72 + ((i % 15) * .014),
      joinDate: `202${2 + (i % 4)}-${String((i % 12)+1).padStart(2,'0')}-${String((i % 27)+1).padStart(2,'0')}`,
      todayVisits: i % 8,
      targetVisits: 6 + (i % 3),
      totalVisits: 45 + (i * 7) % 340,
      clientId: client[0],
      projectId: project[0],
      photo: employeePhoto(name, i),
    });
  }
  return rows.slice(0,100);
}
function enrich() {
  const db = readDB();
  db.clients = CLIENTS.map(([id,name,initials,color]) => ({ id,name,initials,color,status:'active',logo:clientLogo(name,initials,color) }));
  db.projects = PROJECTS.map(([id,name,clientId,area], index) => ({
    id,name,clientId,area,status:index === 8 ? 'planning' : 'active',
    startDate:`2026-${String((index % 6)+1).padStart(2,'0')}-01`,
    employeeTarget:10,
  }));
  db.employees = buildEmployees(db.employees);
  db._phase0DemoVersion = 2;
  saveDB(db);
}
enrich();
export {};
