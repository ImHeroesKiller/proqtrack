const DB_KEYS=['proqtrack_db_v6','proqtrack_db_v7'];
const VERSION=3;
const now='2026-07-29T08:30:00.000Z';
const day='2026-07-29';
const svg=(label,color='#EF5000')=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="28" fill="${color}"/><text x="80" y="92" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="white">${label}</text></svg>`)}`;
const photo=(label,color)=>svg(label,color);

function buildUatDatabase(){
  const clients=[
    {id:'CL-UAT-001',name:'PT Nusantara FMCG Sejahtera',legalName:'PT Nusantara FMCG Sejahtera',industry:'FMCG',address:'Jl. Gatot Subroto Kav. 52',city:'Jakarta Selatan',province:'DKI Jakarta',status:'active',picName:'Ratna Maheswari',picRole:'National Sales Manager',picPhone:'0812-7000-1001',picEmail:'ratna@nusantarafmcg.example',logo:svg('NFS','#EF5000'),cooperationStart:'2026-01-01',cooperationEnd:'2026-12-31',createdAt:now,updatedAt:now},
    {id:'CL-UAT-002',name:'PT Sehat Sentosa Farma',legalName:'PT Sehat Sentosa Farma',industry:'Farmasi',address:'Jl. TB Simatupang No. 88',city:'Jakarta Selatan',province:'DKI Jakarta',status:'active',picName:'dr. Maya Putri',picRole:'Commercial Director',picPhone:'0813-8000-2201',picEmail:'maya@sehatsentosa.example',logo:svg('SSF','#2563EB'),cooperationStart:'2026-02-01',cooperationEnd:'2027-01-31',createdAt:now,updatedAt:now},
    {id:'CL-UAT-003',name:'PT Mitra Bangunan Indonesia',legalName:'PT Mitra Bangunan Indonesia',industry:'Building Material',address:'Jl. Raya Bekasi No. 141',city:'Bekasi',province:'Jawa Barat',status:'prospect',picName:'Hendra Gunawan',picRole:'Channel Development Head',picPhone:'0811-7000-3301',picEmail:'hendra@mitrabangunan.example',logo:svg('MBI','#0F766E'),createdAt:now,updatedAt:now}
  ];
  const projects=[
    {id:'PRJ-UAT-001',clientId:'CL-UAT-001',name:'Retail Execution Jabodetabek',code:'NFS-REJ-26',description:'Kunjungan outlet, stok, harga, display, promo, dan foto.',startDate:'2026-01-01',endDate:'2026-12-31',status:'active',contractValue:1850000000,targetVisits:4200,targetOutlets:650,region:'Jabodetabek',area:'Jakarta Pusat',supervisorId:'EMP-UAT-001',modules:{visits:true,stocks:true,prices:true,competitorIntel:true,photos:true,attendance:true,leaves:true},createdAt:now,updatedAt:now},
    {id:'PRJ-UAT-002',clientId:'CL-UAT-001',name:'Strategic Promo Intelligence',code:'NFS-SPI-26',description:'Monitoring promo dan gap harga.',startDate:'2026-04-01',endDate:'2026-09-30',status:'active',contractValue:625000000,targetVisits:1200,targetOutlets:220,region:'DKI Jakarta dan Tangerang',area:'Tangerang',supervisorId:'EMP-UAT-002',modules:{visits:true,stocks:false,prices:true,competitorIntel:true,photos:true,attendance:true,leaves:true},createdAt:now,updatedAt:now},
    {id:'PRJ-UAT-003',clientId:'CL-UAT-002',name:'Pharmacy Availability Audit',code:'SSF-PAA-26',description:'Audit ketersediaan, planogram, harga, dan foto rak.',startDate:'2026-02-01',endDate:'2027-01-31',status:'active',contractValue:1320000000,targetVisits:3000,targetOutlets:420,region:'Jabodetabek',area:'Jakarta Selatan',supervisorId:'EMP-UAT-001',modules:{visits:true,stocks:true,prices:true,competitorIntel:false,photos:true,attendance:true,leaves:true},createdAt:now,updatedAt:now},
    {id:'PRJ-UAT-004',clientId:'CL-UAT-003',name:'Building Material Coverage Pilot',code:'MBI-BMC-26',description:'Pilot coverage toko bangunan.',startDate:'2026-08-01',endDate:'2026-10-31',status:'planning',contractValue:275000000,targetVisits:600,targetOutlets:100,region:'Bekasi dan Jakarta Timur',area:'Bekasi',supervisorId:null,modules:{visits:true,stocks:true,prices:true,competitorIntel:true,photos:true,attendance:false,leaves:false},createdAt:now,updatedAt:now}
  ];
  const employees=[
    {id:'EMP-UAT-001',employeeNumber:'UAT-0001',name:'Rizky Pratama',email:'rizky.supervisor@proqtrack.id',phone:'0812-1000-0001',role:'Supervisor',jobRole:'Supervisor',area:'Jakarta',status:'active',supervisorId:null,joinDate:'2023-01-10',photo:photo('RP','#7C3AED'),lat:-6.2,lng:106.82},
    {id:'EMP-UAT-002',employeeNumber:'UAT-0002',name:'Siti Maharani',email:'siti.supervisor@proqtrack.id',phone:'0812-1000-0002',role:'Supervisor',jobRole:'Supervisor',area:'Tangerang',status:'active',supervisorId:null,joinDate:'2023-03-12',photo:photo('SM','#2563EB'),lat:-6.18,lng:106.63},
    {id:'EMP-UAT-003',employeeNumber:'UAT-0003',name:'Budi Santoso',email:'budi.employee@proqtrack.id',phone:'0812-1000-0003',role:'Field Sales',jobRole:'Field Sales',area:'Jakarta Pusat',status:'active',supervisorId:'EMP-UAT-001',joinDate:'2024-01-15',photo:photo('BS','#EF5000'),lat:-6.194,lng:106.823},
    {id:'EMP-UAT-004',employeeNumber:'UAT-0004',name:'Dewi Lestari',email:'dewi.employee@proqtrack.id',phone:'0812-1000-0004',role:'Field Sales',jobRole:'Field Sales',area:'Jakarta Selatan',status:'active',supervisorId:'EMP-UAT-001',joinDate:'2024-02-20',photo:photo('DL','#DB2777'),lat:-6.261,lng:106.81},
    {id:'EMP-UAT-005',employeeNumber:'UAT-0005',name:'Ahmad Wijaya',email:'ahmad.employee@proqtrack.id',phone:'0812-1000-0005',role:'Field Sales',jobRole:'Field Sales',area:'Tangerang',status:'active',supervisorId:'EMP-UAT-002',joinDate:'2024-03-11',photo:photo('AW','#0F766E'),lat:-6.17,lng:106.64},
    {id:'EMP-UAT-006',employeeNumber:'UAT-0006',name:'Maya Putri',email:'maya.employee@proqtrack.id',phone:'0812-1000-0006',role:'Merchandiser',jobRole:'Field Sales',area:'Bekasi',status:'active',supervisorId:'EMP-UAT-001',joinDate:'2025-01-09',photo:photo('MP','#16A34A'),lat:-6.23,lng:106.99},
    {id:'EMP-UAT-007',employeeNumber:'UAT-0007',name:'Fajar Nugroho',email:'fajar.inactive@proqtrack.id',phone:'0812-1000-0007',role:'Field Sales',jobRole:'Field Sales',area:'Jakarta Barat',status:'inactive',supervisorId:'EMP-UAT-001',joinDate:'2023-08-15',photo:photo('FN','#64748B'),lat:-6.17,lng:106.78},
    {id:'EMP-UAT-008',employeeNumber:'UAT-0008',name:'Nadia Permata',email:'nadia.noaccount@proqtrack.id',phone:'0812-1000-0008',role:'Field Sales',jobRole:'Field Sales',area:'Depok',status:'active',supervisorId:'EMP-UAT-002',joinDate:'2026-07-01',photo:photo('NP','#D97706'),lat:-6.4,lng:106.82}
  ];
  const accounts=[
    {id:'ACC-UAT-SA',email:'superadmin@proqtrack.id',password:'Proqpay2026',role:'superadmin',employeeId:null,organizationId:null,name:'Superadmin UAT',status:'active',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-000',email:'manager@proqtrack.id',password:'Proqpay2026',role:'manager',employeeId:null,organizationId:'ORG-DEFAULT',name:'Manager UAT',status:'active',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-001',email:'rizky.supervisor@proqtrack.id',password:'Proqpay2026',role:'supervisor',employeeId:'EMP-UAT-001',name:'Rizky Pratama',status:'active',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-002',email:'siti.supervisor@proqtrack.id',password:'Proqpay2026',role:'supervisor',employeeId:'EMP-UAT-002',name:'Siti Maharani',status:'active',mustChangePassword:true,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-003',email:'budi.employee@proqtrack.id',password:'Proqpay2026',role:'employee',employeeId:'EMP-UAT-003',name:'Budi Santoso',status:'active',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-004',email:'dewi.employee@proqtrack.id',password:'Proqpay2026',role:'employee',employeeId:'EMP-UAT-004',name:'Dewi Lestari',status:'active',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-005',email:'ahmad.employee@proqtrack.id',password:'Proqpay2026',role:'employee',employeeId:'EMP-UAT-005',name:'Ahmad Wijaya',status:'suspended',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now},
    {id:'ACC-UAT-006',email:'fajar.inactive@proqtrack.id',password:'Proqpay2026',role:'employee',employeeId:'EMP-UAT-007',name:'Fajar Nugroho',status:'inactive',mustChangePassword:false,lastLoginAt:null,createdAt:now,updatedAt:now}
  ];
  const projectAssignments=[
    {id:'ASN-UAT-001',employeeId:'EMP-UAT-001',projectId:'PRJ-UAT-001',roleOnProject:'supervisor',startDate:'2026-01-01',endDate:'2026-12-31',status:'active'},
    {id:'ASN-UAT-002',employeeId:'EMP-UAT-001',projectId:'PRJ-UAT-003',roleOnProject:'supervisor',startDate:'2026-02-01',endDate:'2027-01-31',status:'active'},
    {id:'ASN-UAT-003',employeeId:'EMP-UAT-002',projectId:'PRJ-UAT-002',roleOnProject:'supervisor',startDate:'2026-04-01',endDate:'2026-09-30',status:'active'},
    {id:'ASN-UAT-004',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',roleOnProject:'field_sales',supervisorId:'EMP-UAT-001',startDate:'2026-01-01',endDate:'2026-12-31',status:'active'},
    {id:'ASN-UAT-005',employeeId:'EMP-UAT-004',projectId:'PRJ-UAT-003',roleOnProject:'field_sales',supervisorId:'EMP-UAT-001',startDate:'2026-02-01',endDate:'2027-01-31',status:'active'},
    {id:'ASN-UAT-006',employeeId:'EMP-UAT-005',projectId:'PRJ-UAT-002',roleOnProject:'field_sales',supervisorId:'EMP-UAT-002',startDate:'2026-04-01',endDate:'2026-09-30',status:'active'},
    {id:'ASN-UAT-007',employeeId:'EMP-UAT-006',projectId:'PRJ-UAT-001',roleOnProject:'merchandiser',supervisorId:'EMP-UAT-001',startDate:'2026-05-01',endDate:'2026-12-31',status:'active'},
    {id:'ASN-UAT-008',employeeId:'EMP-UAT-007',projectId:'PRJ-UAT-001',roleOnProject:'field_sales',supervisorId:'EMP-UAT-001',startDate:'2026-01-01',endDate:'2026-06-30',status:'ended'}
  ];
  const outlets=[
    {id:'OUT-UAT-001',clientId:'CL-UAT-001',projectId:'PRJ-UAT-001',name:'Toko Berkah Jaya',address:'Jl. Sudirman No. 45',channel:'General Trade',type:'Toko Kelontong',area:'Jakarta Pusat',lat:-6.195,lng:106.823,status:'active'},
    {id:'OUT-UAT-002',clientId:'CL-UAT-001',projectId:'PRJ-UAT-001',name:'Minimarket Sejahtera',address:'Jl. Thamrin No. 12',channel:'Modern Trade',type:'Minimarket',area:'Jakarta Pusat',lat:-6.187,lng:106.823,status:'active'},
    {id:'OUT-UAT-003',clientId:'CL-UAT-002',projectId:'PRJ-UAT-003',name:'Apotek Sehat Menteng',address:'Jl. Cikini Raya No. 21',channel:'Pharmacy',type:'Apotek',area:'Jakarta Pusat',lat:-6.19,lng:106.84,status:'active'},
    {id:'OUT-UAT-004',clientId:'CL-UAT-002',projectId:'PRJ-UAT-003',name:'Klinik Sentosa Tebet',address:'Jl. Tebet Barat No. 8',channel:'Pharmacy',type:'Klinik',area:'Jakarta Selatan',lat:-6.23,lng:106.85,status:'active'},
    {id:'OUT-UAT-005',clientId:'CL-UAT-001',projectId:'PRJ-UAT-002',name:'Hypermarket Alam Sutera',address:'Jl. Jalur Sutera No. 25',channel:'Modern Trade',type:'Hypermarket',area:'Tangerang',lat:-6.22,lng:106.65,status:'active'},
    {id:'OUT-UAT-006',clientId:'CL-UAT-003',projectId:'PRJ-UAT-004',name:'Toko Bangunan Maju',address:'Jl. Raya Bekasi KM 18',channel:'Building Material',type:'Toko Bangunan',area:'Bekasi',lat:-6.24,lng:106.99,status:'active'},
    {id:'OUT-UAT-007',clientId:'CL-UAT-001',projectId:'PRJ-UAT-001',name:'Warung Makmur',address:'Jl. Kramat Raya No. 7',channel:'General Trade',type:'Warung',area:'Jakarta Pusat',lat:-6.18,lng:106.84,status:'inactive'}
  ];
  const attendance=[
    {id:'ATT-UAT-001',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',date:day,checkInAt:`${day}T00:43:00.000Z`,checkOutAt:`${day}T09:05:00.000Z`,checkInTime:'07:43',checkOutTime:'16:05',status:'present',attendanceStatus:'present',lat:-6.195,lng:106.823,accuracy:12,checkInLocation:'Toko Berkah Jaya',checkInPhotoDataUrl:photo('IN','#16A34A'),checkOutPhotoDataUrl:photo('OUT','#2563EB'),note:'Kehadiran valid'},
    {id:'ATT-UAT-002',employeeId:'EMP-UAT-004',projectId:'PRJ-UAT-003',date:day,checkInAt:`${day}T01:18:00.000Z`,checkOutAt:null,checkInTime:'08:18',status:'late',attendanceStatus:'flagged',lat:-6.23,lng:106.85,accuracy:84,checkInLocation:'Klinik Sentosa Tebet',checkInPhotoDataUrl:photo('LATE','#D97706'),checkOutPhotoDataUrl:null,note:'Terlambat dan akurasi GPS rendah'},
    {id:'ATT-UAT-003',employeeId:'EMP-UAT-005',projectId:'PRJ-UAT-002',date:day,checkInAt:`${day}T00:51:00.000Z`,checkOutAt:null,checkInTime:'07:51',status:'present',attendanceStatus:'valid',lat:-6.22,lng:106.65,accuracy:18,checkInLocation:'Hypermarket Alam Sutera',checkInPhotoDataUrl:null,checkOutPhotoDataUrl:null,note:'Data lama tanpa foto untuk pengujian exception'},
    {id:'ATT-UAT-004',employeeId:'EMP-UAT-006',projectId:'PRJ-UAT-001',date:day,checkInAt:null,checkOutAt:null,status:'absent',attendanceStatus:'rejected',note:'Tidak check-in'},
    {id:'ATT-UAT-005',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',date:'2026-07-28',checkInTime:'07:39',checkOutTime:'16:10',status:'present',attendanceStatus:'valid',checkInPhotoDataUrl:photo('28','#16A34A')}
  ];
  const visits=[
    {id:'VIS-UAT-001',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',outletId:'OUT-UAT-001',date:day,visitDate:day,checkInTime:'08:05',checkOutTime:'08:42',status:'completed',visitStatus:'completed',notes:'Stok aman, tambah display gondola.',rating:5},
    {id:'VIS-UAT-002',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',outletId:'OUT-UAT-002',date:day,visitDate:day,checkInTime:'09:15',checkOutTime:null,status:'checked-in',visitStatus:'in_progress',notes:'Audit promo berjalan.',rating:0},
    {id:'VIS-UAT-003',employeeId:'EMP-UAT-004',projectId:'PRJ-UAT-003',outletId:'OUT-UAT-004',date:day,visitDate:day,checkInTime:'09:00',checkOutTime:'09:35',status:'completed',visitStatus:'completed',notes:'Planogram sesuai, dua SKU kosong.',rating:4},
    {id:'VIS-UAT-004',employeeId:'EMP-UAT-005',projectId:'PRJ-UAT-002',outletId:'OUT-UAT-005',date:day,visitDate:day,checkInTime:null,checkOutTime:null,status:'planned',visitStatus:'planned',notes:'',rating:0},
    {id:'VIS-UAT-005',employeeId:'EMP-UAT-006',projectId:'PRJ-UAT-001',outletId:'OUT-UAT-007',date:'2026-07-28',visitDate:'2026-07-28',checkInTime:'10:10',checkOutTime:'10:20',status:'failed',visitStatus:'failed',notes:'Outlet tutup permanen.',rating:1}
  ];
  const products=[
    {id:'PRD-UAT-001',clientId:'CL-UAT-001',name:'FreshMilk UHT 1L',brand:'Nusantara Dairy',category:'Minuman',unit:'pcs',price:18500,cost:14500,sku:'NFS-FM-1L',status:'active'},
    {id:'PRD-UAT-002',clientId:'CL-UAT-001',name:'Snack Crispy 68g',brand:'Nusantara Foods',category:'Snack',unit:'pcs',price:9500,cost:7200,sku:'NFS-SC-68',status:'active'},
    {id:'PRD-UAT-003',clientId:'CL-UAT-002',name:'Vitamin C 500mg',brand:'SehatPlus',category:'Farmasi',unit:'box',price:42000,cost:32000,sku:'SSF-VC-500',status:'active'},
    {id:'PRD-UAT-004',clientId:'CL-UAT-003',name:'Semen Kokoh 50kg',brand:'MitraBuild',category:'Bangunan',unit:'sak',price:62000,cost:55000,sku:'MBI-SK-50',status:'inactive'}
  ];
  const stocks=[
    {id:'STK-UAT-001',projectId:'PRJ-UAT-001',outletId:'OUT-UAT-001',productId:'PRD-UAT-001',quantity:24,minStock:12,lastUpdated:day,updatedBy:'EMP-UAT-003'},
    {id:'STK-UAT-002',projectId:'PRJ-UAT-001',outletId:'OUT-UAT-002',productId:'PRD-UAT-002',quantity:5,minStock:15,lastUpdated:day,updatedBy:'EMP-UAT-003'},
    {id:'STK-UAT-003',projectId:'PRJ-UAT-003',outletId:'OUT-UAT-004',productId:'PRD-UAT-003',quantity:0,minStock:8,lastUpdated:day,updatedBy:'EMP-UAT-004'}
  ];
  const priceObservations=[
    {id:'PRC-UAT-001',projectId:'PRJ-UAT-001',visitId:'VIS-UAT-001',outletId:'OUT-UAT-001',productId:'PRD-UAT-001',observedPrice:19000,discountPercent:0,recordedBy:'EMP-UAT-003',recordedAt:day},
    {id:'PRC-UAT-002',projectId:'PRJ-UAT-001',visitId:'VIS-UAT-002',outletId:'OUT-UAT-002',productId:'PRD-UAT-002',observedPrice:8500,discountPercent:10,recordedBy:'EMP-UAT-003',recordedAt:day},
    {id:'PRC-UAT-003',projectId:'PRJ-UAT-003',visitId:'VIS-UAT-003',outletId:'OUT-UAT-004',productId:'PRD-UAT-003',observedPrice:44000,discountPercent:0,recordedBy:'EMP-UAT-004',recordedAt:day}
  ];
  const competitors=[{id:'CMP-UAT-001',name:'Kompetitor Alpha',category:'FMCG',color:'#DC2626',status:'active'},{id:'CMP-UAT-002',name:'Kompetitor Farma Beta',category:'Farmasi',color:'#7C3AED',status:'active'}];
  const competitorProducts=[{id:'CPD-UAT-001',competitorId:'CMP-UAT-001',name:'Alpha Milk 1L',sku:'ALP-MILK-1L',typicalPrice:17500,unit:'pcs',status:'active'},{id:'CPD-UAT-002',competitorId:'CMP-UAT-002',name:'Beta Vitamin C',sku:'BET-VC-500',typicalPrice:39000,unit:'box',status:'active'}];
  const competitorIntel=[
    {id:'CIN-UAT-001',projectId:'PRJ-UAT-002',visitId:'VIS-UAT-004',outletId:'OUT-UAT-005',employeeId:'EMP-UAT-005',competitorId:'CMP-UAT-001',competitorProductId:'CPD-UAT-001',promoType:'bundle',title:'Bundle 2+1',description:'Bundle akhir bulan pada area kasir.',severity:'high',status:'open',createdAt:now},
    {id:'CIN-UAT-002',projectId:'PRJ-UAT-003',visitId:'VIS-UAT-003',outletId:'OUT-UAT-004',employeeId:'EMP-UAT-004',competitorId:'CMP-UAT-002',competitorProductId:'CPD-UAT-002',promoType:'disc_pct',title:'Diskon 15%',description:'Diskon member klinik.',severity:'medium',status:'resolved',createdAt:'2026-07-28T07:00:00.000Z'}
  ];
  const fieldPhotos=[
    {id:'PHT-UAT-001',employeeId:'EMP-UAT-003',projectId:'PRJ-UAT-001',storeId:'OUT-UAT-001',outletId:'OUT-UAT-001',type:'shelf',photoType:'shelf',title:'Display Gondola',note:'Display sesuai planogram.',photoUrl:photo('DSP','#EF5000'),createdAt:now,status:'approved'},
    {id:'PHT-UAT-002',employeeId:'EMP-UAT-004',projectId:'PRJ-UAT-003',storeId:'OUT-UAT-004',outletId:'OUT-UAT-004',type:'product',photoType:'product',title:'Rak Vitamin',note:'Dua SKU kosong.',photoUrl:photo('STK','#2563EB'),createdAt:now,status:'pending'},
    {id:'PHT-UAT-003',employeeId:'EMP-UAT-005',projectId:'PRJ-UAT-002',storeId:'OUT-UAT-005',outletId:'OUT-UAT-005',type:'competitor',photoType:'competitor',title:'Promo Kompetitor',note:'Bundle kasir.',photoUrl:photo('PRM','#DC2626'),createdAt:now,status:'flagged'}
  ];
  const leaveTypes=[{id:'LVT-UAT-001',name:'Cuti Tahunan',quota:12,color:'#EA580C',needsApproval:true},{id:'LVT-UAT-002',name:'Sakit',quota:7,color:'#EF4444',needsApproval:true},{id:'LVT-UAT-003',name:'Ijin Dinas',quota:30,color:'#059669',needsApproval:false}];
  const leaves=[
    {id:'LV-UAT-001',employeeId:'EMP-UAT-003',type:'Cuti Tahunan',startDate:'2026-08-03',endDate:'2026-08-04',days:2,reason:'Keperluan keluarga',status:'pending',submittedAt:day,approverId:null},
    {id:'LV-UAT-002',employeeId:'EMP-UAT-004',type:'Sakit',startDate:'2026-07-28',endDate:'2026-07-28',days:1,reason:'Demam',status:'approved',submittedAt:'2026-07-27',approverId:'ACC-UAT-001',approvedAt:'2026-07-27'},
    {id:'LV-UAT-003',employeeId:'EMP-UAT-005',type:'Cuti Tahunan',startDate:'2026-08-10',endDate:'2026-08-12',days:3,reason:'Liburan',status:'rejected',submittedAt:'2026-07-25',approverId:'ACC-UAT-002',approvedAt:'2026-07-26'}
  ];
  return {
    _version:11,_uatSeedVersion:VERSION,_seededAt:now,updatedAt:now,
    organizations:[{id:'ORG-DEFAULT',name:'Organisasi Demo',legalName:'ProQTrack Demo Tenant',code:'DEMO',industry:'Field Services',status:'active',city:'Jakarta',province:'DKI Jakarta',website:'',notes:'Tenant demo UAT',createdAt:now,updatedAt:now}],
    currentOrganizationId:'ORG-DEFAULT',
    clients,projects,employees,accounts,projectAssignments,outlets,stores:outlets,attendance,visits,products,stocks,priceObservations,competitors,competitorProducts,competitorIntel,
    promoTypes:[{code:'disc_pct',label:'Diskon %',strategic:false},{code:'bundle',label:'Bundle / Paket',strategic:true},{code:'trade_promo',label:'Trade Promo',strategic:true}],fieldPhotos,photos:fieldPhotos,leaveTypes,leaves,
    projectSettings:projects.map(p=>({id:`PST-${p.id}`,projectId:p.id,modules:p.modules,updatedAt:now})),
    reportTemplates:[
      {id:'TPL-UAT-ATT',name:'Rekap Kehadiran UAT',type:'attendance',layout:'landscape',includeCompanyLogo:true,includeClientLogo:true,requireApproval:true,status:'active',columns:['Tanggal','Karyawan','Project','Status','Masuk','Pulang','Lokasi'],createdAt:now},
      {id:'TPL-UAT-EMP',name:'Laporan Individual Karyawan UAT',type:'individual',layout:'portrait',includeCompanyLogo:true,includeClientLogo:true,requireApproval:true,status:'active',columns:['Profil','Project','Kehadiran','Kunjungan','Foto'],createdAt:now},
      {id:'TPL-UAT-PRJ',name:'Ringkasan Project UAT',type:'projects',layout:'landscape',includeCompanyLogo:true,includeClientLogo:true,requireApproval:false,status:'active',columns:['Project','Klien','Periode','HC','Visit'],createdAt:now}
    ],
    reportSettings:{companyName:'ProQTrack UAT',companyLogo:'./assets/logo-light.svg',documentPrefix:'PQT/UAT',nextNumber:4,defaultApproverRole:'manager',signatureName:'Arya Manager',signatureTitle:'Operations Manager',signatureImage:'',updatedAt:now},
    reportApprovals:[
      {id:'APR-UAT-001',documentNumber:'PQT/UAT/00001/2026',title:'Rekap Kehadiran Juli 2026',status:'approved',requestedAt:'2026-07-28T03:00:00.000Z',requestedBy:'ACC-UAT-001',requestedByName:'Rizky Pratama',approvedAt:'2026-07-28T04:00:00.000Z',approvedBy:'ACC-UAT-000',approvedByName:'Manager UAT'},
      {id:'APR-UAT-002',documentNumber:'PQT/UAT/00002/2026',title:'Laporan Project NFS-REJ-26',status:'pending',requestedAt:now,requestedBy:'ACC-UAT-001',requestedByName:'Rizky Pratama'},
      {id:'APR-UAT-003',documentNumber:'PQT/UAT/00003/2026',title:'Laporan Exception GPS',status:'rejected',requestedAt:'2026-07-27T03:00:00.000Z',requestedBy:'ACC-UAT-002',requestedByName:'Siti Maharani',reason:'Perlu bukti foto tambahan'}
    ],
    reportSchedules:[{id:'SCH-UAT-001',name:'Rekap Kehadiran Mingguan',reportType:'attendance',frequency:'weekly',time:'08:00',format:'pdf',status:'active',filters:{projectId:'PRJ-UAT-001'},nextRunAt:'2026-08-03T01:00:00.000Z',createdAt:now,createdBy:'ACC-UAT-000'}],
    reportExports:[{id:'RPE-UAT-001',title:'Rekap Kehadiran 28 Juli',format:'csv',fileName:'rekap-kehadiran-2026-07-28.csv',rowCount:5,status:'completed',storageStatus:'local',createdAt:'2026-07-28T05:00:00.000Z',createdBy:'ACC-UAT-000',createdByName:'Manager UAT'}],
    reportJobs:[{id:'RPJ-UAT-001',reportType:'attendance',format:'pdf',status:'completed',createdAt:'2026-07-28T05:00:00.000Z'},{id:'RPJ-UAT-002',reportType:'field',format:'zip',status:'scheduled_pending',scheduleId:'SCH-UAT-001',createdAt:now}],
    reportFilters:[],
    auditLogs:[
      {id:'AUD-UAT-001',createdAt:'2026-07-28T04:00:00.000Z',actorId:'ACC-UAT-000',actorName:'Manager UAT',action:'approve',entityType:'report',entityId:'APR-UAT-001',description:'Menyetujui laporan UAT'},
      {id:'AUD-UAT-002',createdAt:now,actorId:'ACC-UAT-001',actorName:'Rizky Pratama',action:'create',entityType:'attendance',entityId:'ATT-UAT-002',description:'Mencatat keterlambatan dan GPS flagged'}
    ]
  };
}

function apply(){
  let current={};
  try{current=JSON.parse(localStorage.getItem(DB_KEYS[0])||localStorage.getItem(DB_KEYS[1])||'{}')||{};}catch{}
  if(Number(current._uatSeedVersion||0)>=VERSION)return;
  const db=buildUatDatabase();
  const text=JSON.stringify(db);
  DB_KEYS.forEach(key=>localStorage.setItem(key,text));
  localStorage.setItem('proqtrack_uat_seed_active',String(VERSION));
  window.dispatchEvent(new CustomEvent('proqtrack:db-updated',{detail:{reason:'uat-seed',version:VERSION}}));
}

apply();
export {buildUatDatabase};
