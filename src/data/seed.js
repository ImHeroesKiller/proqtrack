// Seed data for ProQTrack — realistic Indonesian field sales data

export const seedEmployees = [
  { id: 'EMP001', name: 'Budi Santoso',      email: 'budi.santoso@proqtrack.id',     phone: '0812-3456-7801', role: 'Field Sales', area: 'Jakarta Pusat',  status: 'active', lat: -6.1944, lng: 106.8229, joinDate: '2023-01-15', todayVisits: 4, targetVisits: 8, totalVisits: 156 },
  { id: 'EMP002', name: 'Siti Nurhaliza',     email: 'siti.nurhaliza@proqtrack.id',   phone: '0812-3456-7802', role: 'Field Sales', area: 'Jakarta Selatan', status: 'active', lat: -6.2614, lng: 106.8106, joinDate: '2023-03-20', todayVisits: 3, targetVisits: 6, totalVisits: 132 },
  { id: 'EMP003', name: 'Ahmad Wijaya',        email: 'ahmad.wijaya@proqtrack.id',     phone: '0812-3456-7803', role: 'Field Sales', area: 'Jakarta Barat',  status: 'active', lat: -6.1701, lng: 106.7842, joinDate: '2022-11-10', todayVisits: 5, targetVisits: 8, totalVisits: 201 },
  { id: 'EMP004', name: 'Dewi Lestari',       email: 'dewi.lestari@proqtrack.id',     phone: '0812-3456-7804', role: 'Field Sales', area: 'Jakarta Timur',  status: 'active', lat: -6.2250, lng: 106.8986, joinDate: '2023-06-05', todayVisits: 2, targetVisits: 6, totalVisits: 89 },
  { id: 'EMP005', name: 'Rizki Pratama',       email: 'rizki.pratama@proqtrack.id',   phone: '0812-3456-7805', role: 'Supervisor',  area: 'Jakarta Pusat',  status: 'active', lat: -6.1900, lng: 106.8200, joinDate: '2022-01-10', todayVisits: 1, targetVisits: 4, totalVisits: 312 },
  { id: 'EMP006', name: 'Maya Sari',           email: 'maya.sari@proqtrack.id',       phone: '0812-3456-7806', role: 'Field Sales', area: 'Jakarta Utara',  status: 'active', lat: -6.1384, lng: 106.8726, joinDate: '2023-08-15', todayVisits: 6, targetVisits: 8, totalVisits: 78 },
  { id: 'EMP007', name: 'Fajar Nugroho',       email: 'fajar.nugroho@proqtrack.id',   phone: '0812-3456-7807', role: 'Field Sales', area: 'Jakarta Selatan', status: 'inactive', lat: -6.2600, lng: 106.8110, joinDate: '2023-02-28', todayVisits: 0, targetVisits: 6, totalVisits: 145 },
  { id: 'EMP008', name: 'Indah Permata',       email: 'indah.permata@proqtrack.id',   phone: '0812-3456-7808', role: 'Field Sales', area: 'Jakarta Barat',  status: 'active', lat: -6.1700, lng: 106.7850, joinDate: '2023-04-12', todayVisits: 4, targetVisits: 7, totalVisits: 98 },
];

export const seedOutlets = [
  { id: 'OUT001', name: 'Toko Berkah Jaya',       address: 'Jl. Sudirman No. 45, Tanah Abang, Jakarta Pusat',  type: 'Toko Kelontong',  lat: -6.1950, lng: 106.8235, owner: 'Pak Slamet',     phone: '0812-3450-0001', area: 'Jakarta Pusat',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT002', name: 'Minimarket Sejahtera',   address: 'Jl. Thamrin No. 12, Gambir, Jakarta Pusat',        type: 'Minimarket',       lat: -6.1869, lng: 106.8230, owner: 'Bu Hartini',     phone: '0812-3450-0002', area: 'Jakarta Pusat',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT003', name: 'Warung Kopi Nusantara',   address: 'Jl. Sabang No. 8, Menteng, Jakarta Pusat',         type: 'Warung Kopi',      lat: -6.1930, lng: 106.8320, owner: 'Pak Yanto',      phone: '0812-3450-0003', area: 'Jakarta Pusat',  visitFrequency: 'Bulanan',   status: 'active' },
  { id: 'OUT004', name: 'Apotek Kimia Farma',      address: 'Jl. Fatmawati No. 200, Cipete, Jakarta Selatan',  type: 'Apotek',           lat: -6.2880, lng: 106.7950, owner: 'Ibu Rita',       phone: '0812-3450-0004', area: 'Jakarta Selatan', visitFrequency: 'Bulanan',   status: 'active' },
  { id: 'OUT005', name: 'Toko Bangunan Maju',      address: 'Jl. Daan Mogot No. 88, Grogol, Jakarta Barat',    type: 'Toko Bangunan',    lat: -6.1500, lng: 106.7400, owner: 'Pak Hendra',     phone: '0812-3450-0005', area: 'Jakarta Barat',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT006', name: 'Restoran Padang Sederhana', address: 'Jl. Tebet Barat No. 5, Tebet, Jakarta Selatan', type: 'Restoran',        lat: -6.2300, lng: 106.8500, owner: 'Pak Edo',        phone: '0812-3450-0006', area: 'Jakarta Selatan', visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT007', name: 'Toko Elektronik Jaya',    address: 'Jl. Margonda Raya No. 50, Depok',                 type: 'Toko Elektronik',  lat: -6.1400, lng: 106.8500, owner: 'Pak Tony',       phone: '0812-3450-0007', area: 'Jakarta Timur',  visitFrequency: 'Bulanan',   status: 'active' },
  { id: 'OUT008', name: 'Bakery Sweet Home',       address: 'Jl. Kelapa Gading No. 15, Jakarta Utara',         type: 'Bakery',           lat: -6.1600, lng: 106.8900, owner: 'Ibu Lina',       phone: '0812-3450-0008', area: 'Jakarta Utara',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT009', name: 'Toko Fashion Cantik',     address: 'Jl. Roxy Mas No. 25, Jakarta Pusat',              type: 'Toko Fashion',     lat: -6.1700, lng: 106.8000, owner: 'Ibu Tini',       phone: '0812-3450-0009', area: 'Jakarta Pusat',  visitFrequency: 'Bulanan',   status: 'active' },
  { id: 'OUT010', name: 'Minimarket Bahagia',      address: 'Jl. Pluit Raya No. 30, Jakarta Utara',           type: 'Minimarket',       lat: -6.1200, lng: 106.8600, owner: 'Pak Dodo',       phone: '0812-3450-0010', area: 'Jakarta Utara',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT011', name: 'Toko Kelontong Makmur',   address: 'Jl. Cipinang No. 17, Jakarta Timur',              type: 'Toko Kelontong',   lat: -6.2300, lng: 106.8800, owner: 'Pak Joko',       phone: '0812-3450-0011', area: 'Jakarta Timur',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT012', name: 'Warung Kopi Senja',       address: 'Jl. Senopati No. 42, Jakarta Selatan',            type: 'Warung Kopi',      lat: -6.2450, lng: 106.8100, owner: 'Ibu Wati',       phone: '0812-3450-0012', area: 'Jakarta Selatan', visitFrequency: 'Bulanan',  status: 'active' },
  { id: 'OUT013', name: 'Apotek Klinik Sehat',     address: 'Jl. Grogol No. 10, Jakarta Barat',                type: 'Apotek',           lat: -6.1600, lng: 106.7800, owner: 'Pak Doni',       phone: '0812-3450-0013', area: 'Jakarta Barat',  visitFrequency: 'Bulanan',   status: 'inactive' },
  { id: 'OUT014', name: 'Toko Bangunan Sentosa',  address: 'Jl. Green Lake No. 8, Jakarta Barat',             type: 'Toko Bangunan',    lat: -6.1800, lng: 106.7600, owner: 'Pak Bambang',    phone: '0812-3450-0014', area: 'Jakarta Barat',  visitFrequency: 'Bulanan',   status: 'active' },
  { id: 'OUT015', name: 'Restoran Bebek Goreng',   address: 'Jl. Cempaka Putih No. 20, Jakarta Pusat',        type: 'Restoran',         lat: -6.1700, lng: 106.8500, owner: 'Ibu Nunung',     phone: '0812-3450-0015', area: 'Jakarta Pusat',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT016', name: 'Toko Kelontong Rezeki',   address: 'Jl. Pondok Indah No. 5, Jakarta Selatan',         type: 'Toko Kelontong',   lat: -6.2650, lng: 106.7800, owner: 'Pak Aceng',      phone: '0812-3450-0016', area: 'Jakarta Selatan', visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT017', name: 'Minimart Murah Meriah',   address: 'Jl. Sunter No. 11, Jakarta Utara',                type: 'Minimarket',       lat: -6.1400, lng: 106.8600, owner: 'Ibu Yuni',       phone: '0812-3450-0017', area: 'Jakarta Utara',  visitFrequency: 'Mingguan',  status: 'active' },
  { id: 'OUT018', name: 'Toko Elektronik Sentral', address: 'Jl. Matraman No. 33, Jakarta Timur',              type: 'Toko Elektronik',  lat: -6.2100, lng: 106.8700, owner: 'Pak Yusuf',      phone: '0812-3450-0018', area: 'Jakarta Timur',  visitFrequency: 'Bulanan',   status: 'active' },
];

export const seedVisits = [
  { id: 'VIS001', employeeId: 'EMP001', outletId: 'OUT001', date: '2024-07-27', checkInTime: '08:15', checkOutTime: '08:45', status: 'completed',     notes: 'Stok produk cukup, pesanan baru 5 karton',  rating: 5 },
  { id: 'VIS002', employeeId: 'EMP001', outletId: 'OUT002', date: '2024-07-27', checkInTime: '09:10', checkOutTime: '09:30', status: 'completed',     notes: 'Restock minuman, tambah display baru',       rating: 4 },
  { id: 'VIS003', employeeId: 'EMP001', outletId: 'OUT003', date: '2024-07-27', checkInTime: '10:00', checkOutTime: null,     status: 'checked-in',    notes: 'Sedang briefing dengan owner',             rating: 0 },
  { id: 'VIS004', employeeId: 'EMP001', outletId: 'OUT009', date: '2024-07-27', checkInTime: null,    checkOutTime: null,     status: 'planned',       notes: '',                                          rating: 0 },
  { id: 'VIS005', employeeId: 'EMP002', outletId: 'OUT004', date: '2024-07-27', checkInTime: '08:30', checkOutTime: '09:00', status: 'completed',     notes: 'Pemesanan obat baru, koordinasi dengan apoteker', rating: 5 },
  { id: 'VIS006', employeeId: 'EMP002', outletId: 'OUT006', date: '2024-07-27', checkInTime: '09:20', checkOutTime: '09:50', status: 'completed',     notes: 'Diskusi promo menu baru',                   rating: 4 },
  { id: 'VIS007', employeeId: 'EMP002', outletId: 'OUT012', date: '2024-07-27', checkInTime: '10:15', checkOutTime: null,     status: 'checked-in',    notes: 'Sampling produk kopi baru',                 rating: 0 },
  { id: 'VIS008', employeeId: 'EMP003', outletId: 'OUT005', date: '2024-07-27', checkInTime: '08:00', checkOutTime: '08:30', status: 'completed',     notes: 'Pengiriman material, cek stok semen',       rating: 5 },
  { id: 'VIS009', employeeId: 'EMP003', outletId: 'OUT014', date: '2024-07-27', checkInTime: '09:00', checkOutTime: '09:40', status: 'completed',     notes: 'Order cat baru 20 kaleng',                  rating: 4 },
  { id: 'VIS010', employeeId: 'EMP003', outletId: 'OUT013', date: '2024-07-27', checkInTime: '10:00', checkOutTime: '10:25', status: 'completed',     notes: 'Outlet tutup sementara, cek kapan buka lagi', rating: 3 },
  { id: 'VIS011', employeeId: 'EMP003', outletId: 'OUT005', date: '2024-07-27', checkInTime: null,    checkOutTime: null,     status: 'planned',       notes: '',                                          rating: 0 },
  { id: 'VIS012', employeeId: 'EMP004', outletId: 'OUT007', date: '2024-07-27', checkInTime: '08:45', checkOutTime: '09:15', status: 'completed',     notes: 'Demo produk elektronik baru',               rating: 5 },
  { id: 'VIS013', employeeId: 'EMP004', outletId: 'OUT011', date: '2024-07-27', checkInTime: '09:30', checkOutTime: '10:00', status: 'completed',     notes: 'Restock sembako',                           rating: 4 },
  { id: 'VIS014', employeeId: 'EMP004', outletId: 'OUT018', date: '2024-07-27', checkInTime: null,    checkOutTime: null,     status: 'planned',       notes: '',                                          rating: 0 },
  { id: 'VIS015', employeeId: 'EMP005', outletId: 'OUT002', date: '2024-07-27', checkInTime: '08:00', checkOutTime: '08:20', status: 'completed',     notes: 'Supervisi, cek display dan stok',            rating: 5 },
  { id: 'VIS016', employeeId: 'EMP006', outletId: 'OUT008', date: '2024-07-27', checkInTime: '07:45', checkOutTime: '08:15', status: 'completed',     notes: 'Order roti untuk harian',                   rating: 5 },
  { id: 'VIS017', employeeId: 'EMP006', outletId: 'OUT010', date: '2024-07-27', checkInTime: '08:30', checkOutTime: '09:00', status: 'completed',     notes: 'Restock soft drink, evaluasi penjualan',    rating: 4 },
  { id: 'VIS018', employeeId: 'EMP006', outletId: 'OUT017', date: '2024-07-27', checkInTime: '09:15', checkOutTime: '09:45', status: 'completed',     notes: 'Promo gula baru',                          rating: 4 },
  { id: 'VIS019', employeeId: 'EMP006', outletId: 'OUT008', date: '2024-07-27', checkInTime: '10:00', checkOutTime: '10:30', status: 'completed',     notes: 'Cek kualitas, komplain roti basi',          rating: 3 },
  { id: 'VIS020', employeeId: 'EMP006', outletId: 'OUT017', date: '2024-07-27', checkInTime: '10:45', checkOutTime: null,     status: 'checked-in',    notes: 'Negosiasi harga',                           rating: 0 },
  { id: 'VIS021', employeeId: 'EMP008', outletId: 'OUT014', date: '2024-07-27', checkInTime: '08:20', checkOutTime: '08:50', status: 'completed',     notes: 'Order pipa PVC 50 batang',                  rating: 5 },
  { id: 'VIS022', employeeId: 'EMP008', outletId: 'OUT005', date: '2024-07-27', checkInTime: '09:10', checkOutTime: '09:35', status: 'completed',     notes: 'Restock cat tembok',                        rating: 4 },
  { id: 'VIS023', employeeId: 'EMP008', outletId: 'OUT013', date: '2024-07-27', checkInTime: '10:00', checkOutTime: null,     status: 'checked-in',    notes: 'Evaluasi performa outlet',                  rating: 0 },
  { id: 'VIS024', employeeId: 'EMP001', outletId: 'OUT015', date: '2024-07-26', checkInTime: '14:00', checkOutTime: '14:30', status: 'completed',     notes: 'Order bebek 10 ekor',                       rating: 5 },
  { id: 'VIS025', employeeId: 'EMP002', outletId: 'OUT016', date: '2024-07-26', checkInTime: '13:30', checkOutTime: '14:00', status: 'completed',     notes: 'Restock sembako, tawar promo',              rating: 4 },
  { id: 'VIS026', employeeId: 'EMP003', outletId: 'OUT014', date: '2024-07-26', checkInTime: '14:15', checkOutTime: '15:00', status: 'completed',     notes: 'Pengiriman keramik',                        rating: 4 },
  { id: 'VIS027', employeeId: 'EMP004', outletId: 'OUT018', date: '2024-07-26', checkInTime: '15:00', checkOutTime: '15:30', status: 'completed',     notes: 'Demo speaker bluetooth',                    rating: 5 },
  { id: 'VIS028', employeeId: 'EMP006', outletId: 'OUT010', date: '2024-07-26', checkInTime: '14:30', checkOutTime: '15:00', status: 'completed',     notes: 'Evaluasi penjualan mingguan',               rating: 4 },
];

export const seedAttendance = [
  { id: 'ATT001', employeeId: 'EMP001', date: '2024-07-27', checkInTime: '07:45', checkInLocation: 'Kantor Pusat Jakarta',     status: 'hadir' },
  { id: 'ATT002', employeeId: 'EMP002', date: '2024-07-27', checkInTime: '08:05', checkInLocation: 'Rumah — Jakarta Selatan',  status: 'terlambat' },
  { id: 'ATT003', employeeId: 'EMP003', date: '2024-07-27', checkInTime: '07:30', checkInLocation: 'Kantor Cabang Jakarta Barat', status: 'hadir' },
  { id: 'ATT004', employeeId: 'EMP004', date: '2024-07-27', checkInTime: '08:15', checkInLocation: 'Rumah — Jakarta Timur',     status: 'terlambat' },
  { id: 'ATT005', employeeId: 'EMP005', date: '2024-07-27', checkInTime: '07:20', checkInLocation: 'Kantor Pusat Jakarta',     status: 'hadir' },
  { id: 'ATT006', employeeId: 'EMP006', date: '2024-07-27', checkInTime: '07:15', checkInLocation: 'Kantor Cabang Jakarta Utara', status: 'hadir' },
  { id: 'ATT007', employeeId: 'EMP007', date: '2024-07-27', checkInTime: null,    checkInLocation: null,                         status: 'tidak hadir' },
  { id: 'ATT008', employeeId: 'EMP008', date: '2024-07-27', checkInTime: '07:50', checkInLocation: 'Kantor Cabang Jakarta Barat', status: 'hadir' },
];

// Login accounts — manager + one per employee
export const seedAccounts = [
  { id: 'ACC000', email: 'manager@proqtrack.id',  password: 'demo123', role: 'manager',  employeeId: null,    name: 'Manager Demo' },
  { id: 'ACC001', email: 'budi.santoso@proqtrack.id',    password: 'budi123',    role: 'employee', employeeId: 'EMP001', name: 'Budi Santoso' },
  { id: 'ACC002', email: 'siti.nurhaliza@proqtrack.id',  password: 'siti123',    role: 'employee', employeeId: 'EMP002', name: 'Siti Nurhaliza' },
  { id: 'ACC003', email: 'ahmad.wijaya@proqtrack.id',    password: 'ahmad123',   role: 'employee', employeeId: 'EMP003', name: 'Ahmad Wijaya' },
  { id: 'ACC004', email: 'dewi.lestari@proqtrack.id',    password: 'dewi123',    role: 'employee', employeeId: 'EMP004', name: 'Dewi Lestari' },
  { id: 'ACC005', email: 'rizki.pratama@proqtrack.id',   password: 'rizki123',   role: 'employee', employeeId: 'EMP005', name: 'Rizki Pratama' },
  { id: 'ACC006', email: 'maya.sari@proqtrack.id',       password: 'maya123',    role: 'employee', employeeId: 'EMP006', name: 'Maya Sari' },
  { id: 'ACC007', email: 'fajar.nugroho@proqtrack.id',   password: 'fajar123',   role: 'employee', employeeId: 'EMP007', name: 'Fajar Nugroho' },
  { id: 'ACC008', email: 'indah.permata@proqtrack.id',   password: 'indah123',   role: 'employee', employeeId: 'EMP008', name: 'Indah Permata' },
];

// Products — katalog produk yang dijual/distribusi ke outlet
export const seedProducts = [
  { id: 'PRD001', name: 'Aqua Botol 600ml',    category: 'Minuman',   unit: 'dus',   price: 28000, sku: 'AQA-600', status: 'active' },
  { id: 'PRD002', name: 'Teh Botol Sosro 350ml', category: 'Minuman', unit: 'dus',   price: 32000, sku: 'TBS-350', status: 'active' },
  { id: 'PRD003', name: 'Indomie Goreng',       category: 'Makanan',  unit: 'kardus', price: 95000, sku: 'IND-GRG', status: 'active' },
  { id: 'PRD004', name: 'Beras Premium 5kg',    category: 'Sembako',  unit: 'karung', price: 68000, sku: 'BRP-5K',  status: 'active' },
  { id: 'PRD005', name: 'Gula Pasir 1kg',       category: 'Sembako',  unit: 'sak',    price: 14000, sku: 'GLP-1K',  status: 'active' },
  { id: 'PRD006', name: 'Minyak Goreng 2L',     category: 'Sembako',  unit: 'btl',    price: 36000, sku: 'MGR-2L',  status: 'active' },
  { id: 'PRD007', name: 'Kopi Kapal Api 165g',  category: 'Minuman',  unit: 'pcs',    price: 18000, sku: 'KKP-165', status: 'active' },
  { id: 'PRD008', name: 'Susu Ultra 250ml',     category: 'Minuman',  unit: 'dus',    price: 24000, sku: 'SUL-250', status: 'active' },
  { id: 'PRD009', name: 'Sabun Lifebuoy',       category: 'Kebersihan', unit: 'dus',  price: 42000, sku: 'SLB-001', status: 'active' },
  { id: 'PRD010', name: 'Rokok Surya 16',       category: 'Rokok',    unit: 'batang', price: 30000, sku: 'RSR-16',  status: 'active' },
  { id: 'PRD011', name: 'Cat Tembok Avian 25kg', category: 'Bangunan', unit: 'galon', price: 450000, sku: 'CTA-25K', status: 'active' },
  { id: 'PRD012', name: 'Semen Gresik 50kg',    category: 'Bangunan', unit: 'sak',    price: 58000, sku: 'SMG-50K', status: 'active' },
  { id: 'PRD013', name: 'Paracetamol Box 10s',  category: 'Obat',     unit: 'box',    price: 8500,  sku: 'PCT-010', status: 'active' },
  { id: 'PRD014', name: 'Roti Tawar Sari',      category: 'Bakery',   unit: 'pcs',    price: 15000, sku: 'RTS-001', status: 'active' },
  { id: 'PRD015', name: 'Kopi Torabika 230g',   category: 'Minuman',  unit: 'pcs',    price: 22000, sku: 'KTB-230', status: 'inactive' },
];

// Leave/Permit types
export const seedLeaveTypes = [
  { id: 'LVT001', name: 'Cuti Tahunan',   quota: 12, color: '#ea580c', needsApproval: true },
  { id: 'LVT002', name: 'Sakit',          quota: 7,  color: '#ef4444', needsApproval: true },
  { id: 'LVT003', name: 'Ijin Pribadi',   quota: 3,  color: '#f59e0b', needsApproval: true },
  { id: 'LVT004', name: 'Ijin Dinas',     quota: 30, color: '#059669', needsApproval: false },
  { id: 'LVT005', name: 'Cuti Melahirkan', quota: 90, color: '#7c3aed', needsApproval: true },
];

// Leave/Permit requests — pengajuan ijin & cuti karyawan
export const seedLeaves = [
  { id: 'LV001', employeeId: 'EMP001', type: 'Cuti Tahunan',  startDate: '2024-08-05', endDate: '2024-08-07', days: 3, reason: 'Liburan keluarga ke Bandung',          status: 'pending',    submittedAt: '2024-07-25', approverId: null,    approvedAt: null },
  { id: 'LV002', employeeId: 'EMP002', type: 'Sakit',         startDate: '2024-07-25', endDate: '2024-07-25', days: 1, reason: 'Demam tinggi, surat dokter terlampir', status: 'approved',   submittedAt: '2024-07-24', approverId: 'ACC000', approvedAt: '2024-07-24' },
  { id: 'LV003', employeeId: 'EMP003', type: 'Ijin Pribadi', startDate: '2024-08-10', endDate: '2024-08-10', days: 1, reason: 'Mengurus dokumen kecamatan',          status: 'pending',    submittedAt: '2024-07-26', approverId: null,    approvedAt: null },
  { id: 'LV004', employeeId: 'EMP004', type: 'Cuti Tahunan',  startDate: '2024-08-15', endDate: '2024-08-20', days: 6, reason: 'Pernikahan kakak',                    status: 'pending',    submittedAt: '2024-07-27', approverId: null,    approvedAt: null },
  { id: 'LV005', employeeId: 'EMP006', type: 'Ijin Dinas',    startDate: '2024-07-28', endDate: '2024-07-28', days: 1, reason: 'Training produk baru di kantor pusat', status: 'approved',   submittedAt: '2024-07-26', approverId: 'ACC000', approvedAt: '2024-07-26' },
  { id: 'LV006', employeeId: 'EMP001', type: 'Sakit',         startDate: '2024-06-10', endDate: '2024-06-11', days: 2, reason: 'Flu berat',                           status: 'rejected',   submittedAt: '2024-06-09', approverId: 'ACC000', approvedAt: '2024-06-09' },
  { id: 'LV007', employeeId: 'EMP008', type: 'Cuti Tahunan',  startDate: '2024-09-01', endDate: '2024-09-05', days: 5, reason: 'Umroh',                               status: 'pending',    submittedAt: '2024-07-27', approverId: null,    approvedAt: null },
];

// Outlet stock — stok produk per outlet (current on-hand)
export const seedStocks = [
  { id: 'STK001', outletId: 'OUT001', productId: 'PRD001', quantity: 24,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK002', outletId: 'OUT001', productId: 'PRD003', quantity: 8,   minStock: 12, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK003', outletId: 'OUT001', productId: 'PRD004', quantity: 15,  minStock: 8,  lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK004', outletId: 'OUT002', productId: 'PRD001', quantity: 48,  minStock: 20, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK005', outletId: 'OUT002', productId: 'PRD007', quantity: 6,   minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK006', outletId: 'OUT003', productId: 'PRD007', quantity: 30,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK007', outletId: 'OUT004', productId: 'PRD013', quantity: 50,  minStock: 20, lastUpdated: '2024-07-27', updatedBy: 'EMP002' },
  { id: 'STK008', outletId: 'OUT005', productId: 'PRD012', quantity: 40,  minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP003' },
  { id: 'STK009', outletId: 'OUT005', productId: 'PRD011', quantity: 3,   minStock: 8,  lastUpdated: '2024-07-27', updatedBy: 'EMP003' },
  { id: 'STK010', outletId: 'OUT006', productId: 'PRD003', quantity: 20,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP002' },
  { id: 'STK011', outletId: 'OUT008', productId: 'PRD014', quantity: 5,   minStock: 12, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK012', outletId: 'OUT010', productId: 'PRD001', quantity: 36,  minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK013', outletId: 'OUT010', productId: 'PRD010', quantity: 100, minStock: 50, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK014', outletId: 'OUT011', productId: 'PRD004', quantity: 18,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP004' },
  { id: 'STK015', outletId: 'OUT014', productId: 'PRD012', quantity: 25,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP008' },
  { id: 'STK016', outletId: 'OUT014', productId: 'PRD011', quantity: 12,  minStock: 5,  lastUpdated: '2024-07-27', updatedBy: 'EMP008' },
  { id: 'STK017', outletId: 'OUT018', productId: 'PRD002', quantity: 4,   minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP004' },
  { id: 'STK018', outletId: 'OUT009', productId: 'PRD006', quantity: 22,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
];

// Price & Discount observations during field visits
export const seedPriceObservations = [
  { id: 'PRC001', visitId: 'VIS001', outletId: 'OUT001', productId: 'PRD001', observedPrice: 3000, discountPercent: 0, discountAmount: 0, notes: 'Harga eceran normal', recordedBy: 'EMP001', recordedAt: '2024-07-27' },
  { id: 'PRC002', visitId: 'VIS001', outletId: 'OUT001', productId: 'PRD003', observedPrice: 3000, discountPercent: 5, discountAmount: 150, notes: 'Promo 5% untuk pembelian >10 dus', recordedBy: 'EMP001', recordedAt: '2024-07-27' },
  { id: 'PRC003', visitId: 'VIS005', outletId: 'OUT004', productId: 'PRD013', observedPrice: 10000, discountPercent: 0, discountAmount: 0, notes: 'Harga naik dari minggu lalu', recordedBy: 'EMP002', recordedAt: '2024-07-27' },
  { id: 'PRC004', visitId: 'VIS008', outletId: 'OUT005', productId: 'PRD012', observedPrice: 62000, discountPercent: 0, discountAmount: 0, notes: 'Semen naik Rp4.000', recordedBy: 'EMP003', recordedAt: '2024-07-27' },
  { id: 'PRC005', visitId: 'VIS008', outletId: 'OUT005', productId: 'PRD011', observedPrice: 480000, discountPercent: 10, discountAmount: 48000, notes: 'Diskon 10% untuk order 5 galon', recordedBy: 'EMP003', recordedAt: '2024-07-27' },
  { id: 'PRC006', visitId: 'VIS016', outletId: 'OUT008', productId: 'PRD014', observedPrice: 16000, discountPercent: 0, discountAmount: 0, notes: 'Harga roti tawar naik', recordedBy: 'EMP006', recordedAt: '2024-07-27' },
  { id: 'PRC007', visitId: 'VIS017', outletId: 'OUT010', productId: 'PRD001', observedPrice: 2800, discountPercent: 0, discountAmount: 0, notes: 'Harga kompetitif', recordedBy: 'EMP006', recordedAt: '2024-07-27' },
  { id: 'PRC008', visitId: 'VIS021', outletId: 'OUT014', productId: 'PRD012', observedPrice: 59000, discountPercent: 0, discountAmount: 0, notes: '', recordedBy: 'EMP008', recordedAt: '2024-07-27' },
];
