// Seed data for ProQTrack — realistic Indonesian field sales (FMCG + bangunan)

export const seedEmployees = [
  { id: 'EMP001', name: 'Budi Santoso',      email: 'budi.santoso@proqtrack.id',     phone: '0812-3456-7801', role: 'Field Sales', area: 'Jakarta Pusat',  status: 'active', lat: -6.1944, lng: 106.8229, joinDate: '2023-01-15', todayVisits: 4, targetVisits: 0, salesTargetAmount: 50000000, totalVisits: 156 },
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

export const seedAccounts = [
  { id: 'ACC-SUPER', email: 'superadmin@proqtrack.id', password: 'Proqpay2026', role: 'superadmin', employeeId: null, organizationId: null, name: 'Superadmin Demo' },
  { id: 'ACC000', email: 'manager@proqtrack.id',  password: 'Proqpay2026', role: 'manager',  employeeId: null, organizationId: 'ORG-DEFAULT', name: 'Manager Demo' },
  { id: 'ACC001', email: 'budi.santoso@proqtrack.id',    password: 'Proqpay2026',    role: 'employee', employeeId: 'EMP001', name: 'Budi Santoso' },
  { id: 'ACC002', email: 'siti.nurhaliza@proqtrack.id',  password: 'Proqpay2026',    role: 'employee', employeeId: 'EMP002', name: 'Siti Nurhaliza' },
  { id: 'ACC003', email: 'ahmad.wijaya@proqtrack.id',    password: 'Proqpay2026',   role: 'employee', employeeId: 'EMP003', name: 'Ahmad Wijaya' },
  { id: 'ACC004', email: 'dewi.lestari@proqtrack.id',    password: 'Proqpay2026',    role: 'employee', employeeId: 'EMP004', name: 'Dewi Lestari' },
  { id: 'ACC005', email: 'rizki.pratama@proqtrack.id',   password: 'Proqpay2026',   role: 'employee', employeeId: 'EMP005', name: 'Rizki Pratama' },
  { id: 'ACC006', email: 'maya.sari@proqtrack.id',       password: 'Proqpay2026',    role: 'employee', employeeId: 'EMP006', name: 'Maya Sari' },
  { id: 'ACC007', email: 'fajar.nugroho@proqtrack.id',   password: 'Proqpay2026',   role: 'employee', employeeId: 'EMP007', name: 'Fajar Nugroho' },
  { id: 'ACC008', email: 'indah.permata@proqtrack.id',   password: 'Proqpay2026',   role: 'employee', employeeId: 'EMP008', name: 'Indah Permata' },
];

// Our catalog — Nestlé, Unilever, Indofood, Mayora, Wings + Semen Tiga Roda / Dulux-style lines
export const seedProducts = [
  { id: 'PRD001', name: 'Dancow Fortigro 800g',       brand: 'Nestlé',     category: 'Susu',       unit: 'pcs',    price: 98000,  cost: 78000,  margin: 20, sku: 'NST-DCW-800', status: 'active' },
  { id: 'PRD002', name: 'Milo Activ-Go 1kg',          brand: 'Nestlé',     category: 'Minuman',    unit: 'pcs',    price: 72000,  cost: 56000,  margin: 22, sku: 'NST-MLO-1K',  status: 'active' },
  { id: 'PRD003', name: 'Indomie Goreng',             brand: 'Indofood',   category: 'Makanan',    unit: 'kardus', price: 95000,  cost: 82000,  margin: 14, sku: 'IDF-IMG-GRG', status: 'active' },
  { id: 'PRD004', name: 'Indomie Soto Mie',           brand: 'Indofood',   category: 'Makanan',    unit: 'kardus', price: 92000,  cost: 80000,  margin: 13, sku: 'IDF-IMG-STO', status: 'active' },
  { id: 'PRD005', name: 'Lifebuoy Total 10 Sabun',    brand: 'Unilever',   category: 'Kebersihan', unit: 'dus',    price: 42000,  cost: 32000,  margin: 24, sku: 'ULV-LFB-010', status: 'active' },
  { id: 'PRD006', name: 'Rinso Anti Noda 900g',       brand: 'Unilever',   category: 'Kebersihan', unit: 'pcs',    price: 28000,  cost: 21000,  margin: 25, sku: 'ULV-RNS-900', status: 'active' },
  { id: 'PRD007', name: 'Pepsodent White 190g',       brand: 'Unilever',   category: 'Kebersihan', unit: 'pcs',    price: 16500,  cost: 12000,  margin: 27, sku: 'ULV-PSD-190', status: 'active' },
  { id: 'PRD008', name: 'Kopiko 78c Coffee Candy',    brand: 'Mayora',     category: 'Snack',      unit: 'dus',    price: 48000,  cost: 38000,  margin: 21, sku: 'MYR-KPK-78',  status: 'active' },
  { id: 'PRD009', name: 'Beng-Beng Share It 130g',    brand: 'Mayora',     category: 'Snack',      unit: 'pcs',    price: 12000,  cost: 9000,   margin: 25, sku: 'MYR-BBG-130', status: 'active' },
  { id: 'PRD010', name: 'Energen Cokelat 10s',        brand: 'Mayora',     category: 'Minuman',    unit: 'box',    price: 18000,  cost: 14000,  margin: 22, sku: 'MYR-ENG-10',  status: 'active' },
  { id: 'PRD011', name: 'So Klin Softener 800ml',     brand: 'Wings',      category: 'Kebersihan', unit: 'btl',    price: 22000,  cost: 16000,  margin: 27, sku: 'WNG-SKL-800', status: 'active' },
  { id: 'PRD012', name: 'Giv White Sabun 80g',        brand: 'Wings',      category: 'Kebersihan', unit: 'pcs',    price: 4500,   cost: 3200,   margin: 29, sku: 'WNG-GIV-80',  status: 'active' },
  { id: 'PRD013', name: 'Ale-Ale Jeruk 200ml',        brand: 'Wings',      category: 'Minuman',    unit: 'dus',    price: 36000,  cost: 28000,  margin: 22, sku: 'WNG-ALE-200', status: 'active' },
  { id: 'PRD014', name: 'Semen Tiga Roda 50kg',       brand: 'Semen Indonesia', category: 'Bangunan', unit: 'sak', price: 58000,  cost: 51000,  margin: 12, sku: 'SMI-TGR-50',  status: 'active' },
  { id: 'PRD015', name: 'Dulux EasyClean 2.5L',       brand: 'Dulux',      category: 'Bangunan',   unit: 'kaleng', price: 185000, cost: 148000, margin: 20, sku: 'DLX-EC-25',   status: 'active' },
  { id: 'PRD016', name: 'Dulux WeatherShield 5L',     brand: 'Dulux',      category: 'Bangunan',   unit: 'kaleng', price: 420000, cost: 340000, margin: 19, sku: 'DLX-WS-5L',   status: 'active' },
  { id: 'PRD017', name: 'Nestlé Pure Life 600ml',     brand: 'Nestlé',     category: 'Minuman',    unit: 'dus',    price: 32000,  cost: 25000,  margin: 22, sku: 'NST-NPL-600', status: 'active' },
  { id: 'PRD018', name: 'Chitato Sapi Panggang 68g',  brand: 'Indofood',   category: 'Snack',      unit: 'pcs',    price: 9500,   cost: 7200,   margin: 24, sku: 'IDF-CHT-68',  status: 'inactive' },
];

export const seedLeaveTypes = [
  { id: 'LVT001', name: 'Cuti Tahunan',   quota: 12, color: '#ea580c', needsApproval: true },
  { id: 'LVT002', name: 'Sakit',          quota: 7,  color: '#ef4444', needsApproval: true },
  { id: 'LVT003', name: 'Ijin Pribadi',   quota: 3,  color: '#f59e0b', needsApproval: true },
  { id: 'LVT004', name: 'Ijin Dinas',     quota: 30, color: '#059669', needsApproval: false },
  { id: 'LVT005', name: 'Cuti Melahirkan', quota: 90, color: '#7c3aed', needsApproval: true },
];

export const seedLeaves = [
  { id: 'LV001', employeeId: 'EMP001', type: 'Cuti Tahunan',  startDate: '2024-08-05', endDate: '2024-08-07', days: 3, reason: 'Liburan keluarga ke Bandung',          status: 'pending',    submittedAt: '2024-07-25', approverId: null,    approvedAt: null },
  { id: 'LV002', employeeId: 'EMP002', type: 'Sakit',         startDate: '2024-07-25', endDate: '2024-07-25', days: 1, reason: 'Demam tinggi, surat dokter terlampir', status: 'approved',   submittedAt: '2024-07-24', approverId: 'ACC000', approvedAt: '2024-07-24' },
  { id: 'LV003', employeeId: 'EMP003', type: 'Ijin Pribadi', startDate: '2024-08-10', endDate: '2024-08-10', days: 1, reason: 'Mengurus dokumen kecamatan',          status: 'pending',    submittedAt: '2024-07-26', approverId: null,    approvedAt: null },
  { id: 'LV004', employeeId: 'EMP004', type: 'Cuti Tahunan',  startDate: '2024-08-15', endDate: '2024-08-20', days: 6, reason: 'Pernikahan kakak',                    status: 'pending',    submittedAt: '2024-07-27', approverId: null,    approvedAt: null },
  { id: 'LV005', employeeId: 'EMP006', type: 'Ijin Dinas',    startDate: '2024-07-28', endDate: '2024-07-28', days: 1, reason: 'Training produk baru di kantor pusat', status: 'approved',   submittedAt: '2024-07-26', approverId: 'ACC000', approvedAt: '2024-07-26' },
  { id: 'LV006', employeeId: 'EMP001', type: 'Sakit',         startDate: '2024-06-10', endDate: '2024-06-11', days: 2, reason: 'Flu berat',                           status: 'rejected',   submittedAt: '2024-06-09', approverId: 'ACC000', approvedAt: '2024-06-09' },
  { id: 'LV007', employeeId: 'EMP008', type: 'Cuti Tahunan',  startDate: '2024-09-01', endDate: '2024-09-05', days: 5, reason: 'Umroh',                               status: 'pending',    submittedAt: '2024-07-27', approverId: null,    approvedAt: null },
];

export const seedStocks = [
  { id: 'STK001', outletId: 'OUT001', productId: 'PRD003', quantity: 18,  minStock: 12, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK002', outletId: 'OUT001', productId: 'PRD005', quantity: 8,   minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK003', outletId: 'OUT001', productId: 'PRD017', quantity: 24,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK004', outletId: 'OUT002', productId: 'PRD001', quantity: 12,  minStock: 8,  lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK005', outletId: 'OUT002', productId: 'PRD006', quantity: 6,   minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK006', outletId: 'OUT003', productId: 'PRD002', quantity: 20,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP001' },
  { id: 'STK007', outletId: 'OUT004', productId: 'PRD007', quantity: 30,  minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP002' },
  { id: 'STK008', outletId: 'OUT005', productId: 'PRD014', quantity: 40,  minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP003' },
  { id: 'STK009', outletId: 'OUT005', productId: 'PRD015', quantity: 3,   minStock: 8,  lastUpdated: '2024-07-27', updatedBy: 'EMP003' },
  { id: 'STK010', outletId: 'OUT006', productId: 'PRD003', quantity: 20,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP002' },
  { id: 'STK011', outletId: 'OUT008', productId: 'PRD009', quantity: 15,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK012', outletId: 'OUT010', productId: 'PRD017', quantity: 36,  minStock: 15, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK013', outletId: 'OUT010', productId: 'PRD011', quantity: 22,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP006' },
  { id: 'STK014', outletId: 'OUT011', productId: 'PRD004', quantity: 18,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP004' },
  { id: 'STK015', outletId: 'OUT014', productId: 'PRD014', quantity: 25,  minStock: 10, lastUpdated: '2024-07-27', updatedBy: 'EMP008' },
  { id: 'STK016', outletId: 'OUT014', productId: 'PRD016', quantity: 6,   minStock: 4,  lastUpdated: '2024-07-27', updatedBy: 'EMP008' },
  { id: 'STK017', outletId: 'OUT016', productId: 'PRD008', quantity: 14,  minStock: 8,  lastUpdated: '2024-07-26', updatedBy: 'EMP002' },
  { id: 'STK018', outletId: 'OUT002', productId: 'PRD010', quantity: 9,   minStock: 12, lastUpdated: '2024-07-27', updatedBy: 'EMP005' },
];

export const seedPriceObservations = [
  { id: 'PRC001', visitId: 'VIS001', outletId: 'OUT001', productId: 'PRD003', observedPrice: 3000, discountPercent: 0, discountAmount: 0, notes: 'Harga eceran normal per bungkus', recordedBy: 'EMP001', recordedAt: '2024-07-27' },
  { id: 'PRC002', visitId: 'VIS001', outletId: 'OUT001', productId: 'PRD005', observedPrice: 4500, discountPercent: 5, discountAmount: 225, notes: 'Promo 5% pembelian >1 dus', recordedBy: 'EMP001', recordedAt: '2024-07-27' },
  { id: 'PRC003', visitId: 'VIS002', outletId: 'OUT002', productId: 'PRD001', observedPrice: 99000, discountPercent: 0, discountAmount: 0, notes: 'Harga naik tipis', recordedBy: 'EMP001', recordedAt: '2024-07-27' },
  { id: 'PRC004', visitId: 'VIS008', outletId: 'OUT005', productId: 'PRD014', observedPrice: 62000, discountPercent: 0, discountAmount: 0, notes: 'Semen naik Rp4.000', recordedBy: 'EMP003', recordedAt: '2024-07-27' },
  { id: 'PRC005', visitId: 'VIS008', outletId: 'OUT005', productId: 'PRD015', observedPrice: 190000, discountPercent: 10, discountAmount: 19000, notes: 'Diskon 10% order 5 kaleng', recordedBy: 'EMP003', recordedAt: '2024-07-27' },
  { id: 'PRC006', visitId: 'VIS017', outletId: 'OUT010', productId: 'PRD017', observedPrice: 3200, discountPercent: 0, discountAmount: 0, notes: 'Harga kompetitif eceran', recordedBy: 'EMP006', recordedAt: '2024-07-27' },
  { id: 'PRC007', visitId: 'VIS015', outletId: 'OUT002', productId: 'PRD006', observedPrice: 27500, discountPercent: 0, discountAmount: 0, notes: '', recordedBy: 'EMP005', recordedAt: '2024-07-27' },
  { id: 'PRC008', visitId: 'VIS021', outletId: 'OUT014', productId: 'PRD014', observedPrice: 59000, discountPercent: 0, discountAmount: 0, notes: '', recordedBy: 'EMP008', recordedAt: '2024-07-27' },
];

// ===== COMPETITORS (master merek kompetitor) =====
export const seedCompetitors = [
  { id: 'CMP001', name: 'Danone',           category: 'Susu & Minuman',  color: '#0055A5', status: 'active', notes: 'Pesaing utama di segmen susu UHT & air mineral' },
  { id: 'CMP002', name: 'Frisian Flag',     category: 'Susu',            color: '#E31C23', status: 'active', notes: 'Kuat di toko kelontong tradisional' },
  { id: 'CMP003', name: 'P&G',              category: 'Kebersihan',      color: '#003DA5', status: 'active', notes: 'Ariel, Pantene, Head & Shoulders' },
  { id: 'CMP004', name: 'ABC / Heinz',      category: 'Makanan',         color: '#C8102E', status: 'active', notes: 'Saus, kecap, mi instan alternatif' },
  { id: 'CMP005', name: 'Semen Gresik',     category: 'Bangunan',        color: '#1B4F72', status: 'active', notes: 'Kompetitor semen di toko bangunan' },
  { id: 'CMP006', name: 'Nippon Paint',     category: 'Bangunan',        color: '#E30613', status: 'active', notes: 'Cat tembok premium vs Dulux' },
  { id: 'CMP007', name: 'GarudaFood',       category: 'Snack',           color: '#F7941D', status: 'active', notes: 'Kacang, wafer, snack lokal' },
  { id: 'CMP008', name: 'Kapal Api Group',  category: 'Minuman',         color: '#8B4513', status: 'active', notes: 'Kopi sachet & white coffee' },
];

// ===== COMPETITOR PRODUCTS =====
export const seedCompetitorProducts = [
  { id: 'CPD001', competitorId: 'CMP001', name: 'Mizone 500ml',           sku: 'DAN-MZN-500', typicalPrice: 5500,  unit: 'btl', status: 'active' },
  { id: 'CPD002', competitorId: 'CMP001', name: 'Aqua Botol 600ml',       sku: 'DAN-AQA-600', typicalPrice: 3500,  unit: 'btl', status: 'active' },
  { id: 'CPD003', competitorId: 'CMP002', name: 'Frisian Flag Bendera 800g', sku: 'FF-BND-800', typicalPrice: 92000, unit: 'pcs', status: 'active' },
  { id: 'CPD004', competitorId: 'CMP002', name: 'Frisian Flag Full Cream 1L', sku: 'FF-FC-1L', typicalPrice: 18500, unit: 'pcs', status: 'active' },
  { id: 'CPD005', competitorId: 'CMP003', name: 'Ariel Matic 800g',       sku: 'PG-ARL-800',  typicalPrice: 29500, unit: 'pcs', status: 'active' },
  { id: 'CPD006', competitorId: 'CMP003', name: 'Pantene Shampoo 170ml',  sku: 'PG-PTN-170',  typicalPrice: 28000, unit: 'btl', status: 'active' },
  { id: 'CPD007', competitorId: 'CMP004', name: 'Mi ABC Selera Pedas',    sku: 'ABC-MI-SPD',  typicalPrice: 2800,  unit: 'pcs', status: 'active' },
  { id: 'CPD008', competitorId: 'CMP004', name: 'Kecap ABC 620ml',        sku: 'ABC-KCP-620', typicalPrice: 16500, unit: 'btl', status: 'active' },
  { id: 'CPD009', competitorId: 'CMP005', name: 'Semen Gresik 50kg',      sku: 'SMG-50K',     typicalPrice: 56000, unit: 'sak', status: 'active' },
  { id: 'CPD010', competitorId: 'CMP005', name: 'Semen Dynamix 50kg',     sku: 'SMG-DYN-50',  typicalPrice: 57000, unit: 'sak', status: 'active' },
  { id: 'CPD011', competitorId: 'CMP006', name: 'Nippon Weatherbond 5L',  sku: 'NPP-WB-5L',   typicalPrice: 395000, unit: 'kaleng', status: 'active' },
  { id: 'CPD012', competitorId: 'CMP006', name: 'Nippon Vinilex 5kg',     sku: 'NPP-VNX-5',   typicalPrice: 175000, unit: 'kaleng', status: 'active' },
  { id: 'CPD013', competitorId: 'CMP007', name: 'Kacang Garuda 200g',     sku: 'GFD-KCG-200', typicalPrice: 14500, unit: 'pcs', status: 'active' },
  { id: 'CPD014', competitorId: 'CMP008', name: 'Kapal Api Special Mix',  sku: 'KAP-SM-20',   typicalPrice: 16000, unit: 'box', status: 'active' },
];

// Jenis promo/diskon strategis (dropdown Intel Kompetitor)
// strategic = true → prioritas pantauan (trade, display, bundle, event, loyalty)
export const seedPromoTypes = [
  { code: 'disc_pct',       label: 'Diskon %',                      strategic: false },
  { code: 'disc_nominal',   label: 'Diskon Nominal (Rp)',            strategic: false },
  { code: 'bogo',           label: 'Beli X Gratis Y',                strategic: false },
  { code: 'bundle',         label: 'Bundle / Paket',                 strategic: true },
  { code: 'cashback',       label: 'Cashback',                       strategic: false },
  { code: 'trade_promo',    label: 'Trade Promo (bonus ke toko)',    strategic: true },
  { code: 'display',        label: 'Insentif Display / Extra Space', strategic: true },
  { code: 'seasonal',       label: 'Promo Musiman / Event',          strategic: true },
  { code: 'loyalty',        label: 'Loyalty / Member',               strategic: true },
  { code: 'clearance',      label: 'Clearance / Obralkan',           strategic: false },
  { code: 'sampling',       label: 'Sampling / Trial',               strategic: false },
  { code: 'custom',         label: 'Lainnya (custom)',               strategic: false },
];

// Field intel during visits — our product vs competitor at outlet
// shelfShare = % rak kita vs total category; visibility: high|medium|low
// hasPromo + promoType (code) + promoNotes + notes
export const seedCompetitorIntel = [
  {
    id: 'INT001', visitId: 'VIS001', outletId: 'OUT001', recordedBy: 'EMP001', recordedAt: '2024-07-27',
    productId: 'PRD003', competitorProductId: 'CPD007',
    ourPrice: 3000, competitorPrice: 2800,
    shelfShare: 55, visibility: 'high',
    hasPromo: true, promoType: 'bogo', promoNotes: 'Kompetitor ABC bundling 5+1 di rak depan',
    notes: 'Indomie masih dominan tapi ABC lebih murah Rp200',
  },
  {
    id: 'INT002', visitId: 'VIS001', outletId: 'OUT001', recordedBy: 'EMP001', recordedAt: '2024-07-27',
    productId: 'PRD005', competitorProductId: 'CPD005',
    ourPrice: 4500, competitorPrice: 4800,
    shelfShare: 40, visibility: 'medium',
    hasPromo: false, promoType: '', promoNotes: '',
    notes: 'Lifebuoy eye-level; Ariel di rak bawah',
  },
  {
    id: 'INT003', visitId: 'VIS002', outletId: 'OUT002', recordedBy: 'EMP001', recordedAt: '2024-07-27',
    productId: 'PRD001', competitorProductId: 'CPD003',
    ourPrice: 99000, competitorPrice: 92000,
    shelfShare: 35, visibility: 'medium',
    hasPromo: true, promoType: 'disc_nominal', promoNotes: 'Frisian Flag diskon Rp5.000 di kasir',
    notes: 'Dancow kalah harga; perlu trade promo',
  },
  {
    id: 'INT004', visitId: 'VIS008', outletId: 'OUT005', recordedBy: 'EMP003', recordedAt: '2024-07-27',
    productId: 'PRD014', competitorProductId: 'CPD009',
    ourPrice: 62000, competitorPrice: 56000,
    shelfShare: 45, visibility: 'high',
    hasPromo: false, promoType: '', promoNotes: '',
    notes: 'Semen Gresik lebih murah signifikan; owner sensitif harga',
  },
  {
    id: 'INT005', visitId: 'VIS008', outletId: 'OUT005', recordedBy: 'EMP003', recordedAt: '2024-07-27',
    productId: 'PRD015', competitorProductId: 'CPD012',
    ourPrice: 190000, competitorPrice: 175000,
    shelfShare: 50, visibility: 'high',
    hasPromo: true, promoType: 'trade_promo', promoNotes: 'Dulux EasyClean: free kuas untuk beli 2 kaleng',
    notes: 'Visibility bagus; promo kuas membantu close order',
  },
  {
    id: 'INT006', visitId: 'VIS015', outletId: 'OUT002', recordedBy: 'EMP005', recordedAt: '2024-07-27',
    productId: 'PRD006', competitorProductId: 'CPD005',
    ourPrice: 27500, competitorPrice: 29500,
    shelfShare: 60, visibility: 'high',
    hasPromo: false, promoType: '', promoNotes: '',
    notes: 'Rinso unggul shelf share di minimarket ini',
  },
  {
    id: 'INT007', visitId: 'VIS017', outletId: 'OUT010', recordedBy: 'EMP006', recordedAt: '2024-07-27',
    productId: 'PRD017', competitorProductId: 'CPD002',
    ourPrice: 3200, competitorPrice: 3500,
    shelfShare: 30, visibility: 'low',
    hasPromo: true, promoType: 'display', promoNotes: 'Aqua display full gondola depan pintu',
    notes: 'Nestlé Pure Life kalah visibility vs Aqua Danone',
  },
  {
    id: 'INT008', visitId: 'VIS021', outletId: 'OUT014', recordedBy: 'EMP008', recordedAt: '2024-07-27',
    productId: 'PRD016', competitorProductId: 'CPD011',
    ourPrice: 420000, competitorPrice: 395000,
    shelfShare: 40, visibility: 'medium',
    hasPromo: false, promoType: '', promoNotes: '',
    notes: 'Nippon Weatherbond lebih agresif harga; cek bundle sealer',
  },
];

// Foto lapangan (visit) — type: location | product | shelf | competitor
// dataUrl null di seed (hemat storage); user capture menyimpan JPEG dataUrl
export const seedFieldPhotos = [
  {
    id: 'PHO001', visitId: 'VIS001', outletId: 'OUT001', type: 'location',
    caption: 'Tampak depan Toko Berkah Jaya', productId: null, competitorId: null,
    dataUrl: null, recordedBy: 'EMP001', recordedAt: '2024-07-27T08:20:00',
  },
  {
    id: 'PHO002', visitId: 'VIS001', outletId: 'OUT001', type: 'shelf',
    caption: 'Rak mi instan eye-level', productId: 'PRD003', competitorId: null,
    dataUrl: null, recordedBy: 'EMP001', recordedAt: '2024-07-27T08:25:00',
  },
  {
    id: 'PHO003', visitId: 'VIS001', outletId: 'OUT001', type: 'competitor',
    caption: 'Display ABC bundling 5+1', productId: null, competitorId: 'CMP004',
    dataUrl: null, recordedBy: 'EMP001', recordedAt: '2024-07-27T08:30:00',
  },
  {
    id: 'PHO004', visitId: 'VIS002', outletId: 'OUT002', type: 'product',
    caption: 'Dancow Fortigro di rak susu', productId: 'PRD001', competitorId: null,
    dataUrl: null, recordedBy: 'EMP001', recordedAt: '2024-07-27T09:15:00',
  },
  {
    id: 'PHO005', visitId: 'VIS003', outletId: 'OUT003', type: 'location',
    caption: 'Warung Kopi Nusantara — check-in', productId: null, competitorId: null,
    dataUrl: null, recordedBy: 'EMP001', recordedAt: '2024-07-27T10:05:00',
  },
  {
    id: 'PHO006', visitId: 'VIS008', outletId: 'OUT005', type: 'product',
    caption: 'Semen Tiga Roda 50kg di gudang', productId: 'PRD014', competitorId: null,
    dataUrl: null, recordedBy: 'EMP003', recordedAt: '2024-07-27T08:10:00',
  },
  {
    id: 'PHO007', visitId: 'VIS008', outletId: 'OUT005', type: 'competitor',
    caption: 'Stack Semen Gresik di depan toko', productId: null, competitorId: 'CMP005',
    dataUrl: null, recordedBy: 'EMP003', recordedAt: '2024-07-27T08:18:00',
  },
  {
    id: 'PHO008', visitId: 'VIS015', outletId: 'OUT002', type: 'shelf',
    caption: 'Supervisi display Rinso vs Ariel', productId: 'PRD006', competitorId: 'CMP003',
    dataUrl: null, recordedBy: 'EMP005', recordedAt: '2024-07-27T08:10:00',
  },
];
