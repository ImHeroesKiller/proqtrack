import { parseDelimited, parseXlsx } from './bulk-upload.js';

const configs = Object.freeze({
  clients: {
    label:'Klien',
    filename:'ProQTrack_Bulk_Clients_Template.csv',
    headers:['client_code','name','legal_name','industry','status','pic_name','pic_role','pic_phone','pic_email','address','city','province','website','cooperation_start','cooperation_end','notes'],
    required:['client_code','name'],
    aliases:{
      client_code:['client_code','client code','kode klien','kode_client','code'],
      name:['name','client_name','client name','nama klien','nama_client','nama'],
      legal_name:['legal_name','legal name','nama legal','nama_legal'],
      industry:['industry','industri'],
      status:['status'],
      pic_name:['pic_name','pic name','nama pic','nama_pic','pic'],
      pic_role:['pic_role','pic role','jabatan pic','jabatan_pic'],
      pic_phone:['pic_phone','pic phone','telepon pic','telepon_pic','no hp pic'],
      pic_email:['pic_email','pic email','email pic','email_pic'],
      address:['address','alamat'],
      city:['city','kota'],
      province:['province','provinsi'],
      website:['website','web'],
      cooperation_start:['cooperation_start','start date','tanggal mulai','tanggal_mulai'],
      cooperation_end:['cooperation_end','end date','tanggal selesai','tanggal_selesai'],
      notes:['notes','catatan'],
    },
  },
  projects: {
    label:'Project',
    filename:'ProQTrack_Bulk_Projects_Template.csv',
    headers:['project_code','name','client_code','status','start_date','end_date','description','region','contract_value','target_visits','target_outlets','notes'],
    required:['project_code','name','client_code'],
    aliases:{
      project_code:['project_code','project code','kode project','kode_project','code'],
      name:['name','project_name','project name','nama project','nama_project','nama'],
      client_code:['client_code','client code','kode klien','kode_client','client'],
      status:['status'],
      start_date:['start_date','start date','mulai','tanggal mulai'],
      end_date:['end_date','end date','selesai','tanggal selesai'],
      description:['description','deskripsi'],
      region:['region','area','wilayah'],
      contract_value:['contract_value','contract value','nilai kontrak','nilai_kontrak'],
      target_visits:['target_visits','target visits','target kunjungan'],
      target_outlets:['target_outlets','target outlets','target outlet'],
      notes:['notes','catatan'],
    },
  },
  outlets: {
    label:'Outlet',
    filename:'ProQTrack_Bulk_Outlets_Template.csv',
    headers:['outlet_code','name','client_code','project_codes','address','area','type','channel','ownership','owner','phone','lat','lng','geofence_radius_m','visit_frequency','status','notes'],
    required:['outlet_code','name','client_code','project_codes'],
    aliases:{
      outlet_code:['outlet_code','outlet code','kode outlet','kode_outlet','code'],
      name:['name','outlet_name','outlet name','nama outlet','nama_outlet','nama'],
      client_code:['client_code','client code','kode klien','kode_client'],
      project_codes:['project_codes','project codes','project_code','project code','kode project','kode_project'],
      address:['address','alamat'],
      area:['area','kota','wilayah'],
      type:['type','tipe','outlet_type','tipe outlet'],
      channel:['channel','segment','segmen'],
      ownership:['ownership','kepemilikan'],
      owner:['owner','pic','pemilik'],
      phone:['phone','telepon','no hp'],
      lat:['lat','latitude'],
      lng:['lng','longitude','lon'],
      geofence_radius_m:['geofence_radius_m','geofence','radius','radius meter'],
      visit_frequency:['visit_frequency','visit frequency','frekuensi kunjungan'],
      status:['status'],
      notes:['notes','catatan'],
    },
  },
  products: {
    label:'Produk',
    filename:'ProQTrack_Bulk_Products_Template.csv',
    headers:['sku','name','client_code','project_codes','brand','category','unit','price','cost','margin','status'],
    required:['sku','name','client_code','project_codes'],
    aliases:{
      sku:['sku','product_code','product code','kode produk','kode_produk'],
      name:['name','product_name','product name','nama produk','nama_produk','nama'],
      client_code:['client_code','client code','kode klien','kode_client'],
      project_codes:['project_codes','project codes','project_code','project code','kode project','kode_project'],
      brand:['brand','merek'],
      category:['category','kategori'],
      unit:['unit','satuan'],
      price:['price','harga','harga jual'],
      cost:['cost','hpp','harga pokok'],
      margin:['margin','margin percent','margin persen'],
      status:['status'],
    },
  },
  competitors: {
    label:'Merek Kompetitor',
    filename:'ProQTrack_Bulk_Competitors_Template.csv',
    headers:['competitor_code','name','category','color','status','notes'],
    required:['competitor_code','name'],
    aliases:{
      competitor_code:['competitor_code','competitor code','kode kompetitor','kode_kompetitor','code'],
      name:['name','competitor_name','competitor name','nama kompetitor','nama_kompetitor','nama','brand'],
      category:['category','kategori'],
      color:['color','warna'],
      status:['status'],
      notes:['notes','catatan'],
    },
  },
  competitorProducts: {
    label:'Produk Kompetitor',
    filename:'ProQTrack_Bulk_Competitor_Products_Template.csv',
    headers:['competitor_code','sku','name','unit','typical_price','status'],
    required:['competitor_code','sku','name'],
    aliases:{
      competitor_code:['competitor_code','competitor code','kode kompetitor','kode_kompetitor','competitor'],
      sku:['sku','product_code','product code','kode produk','kode_produk'],
      name:['name','product_name','product name','nama produk','nama_produk','nama'],
      unit:['unit','satuan'],
      typical_price:['typical_price','typical price','harga tipikal','harga','price'],
      status:['status'],
    },
  },
  projectAssignments: {
    label:'Assignment Project',
    filename:'ProQTrack_Bulk_Project_Assignments_Template.csv',
    headers:['project_code','employee_code','role','supervisor_email','status','start_date','end_date','allocation_percent','notes'],
    required:['project_code','employee_code'],
    aliases:{
      project_code:['project_code','project code','kode project','kode_project'],
      employee_code:['employee_code','employee code','kode karyawan','kode_karyawan','nik'],
      role:['role','position','posisi','role project'],
      supervisor_email:['supervisor_email','supervisor email','email supervisor','email_supervisor'],
      status:['status'],
      start_date:['start_date','start date','tanggal mulai'],
      end_date:['end_date','end date','tanggal selesai'],
      allocation_percent:['allocation_percent','allocation percent','alokasi','alokasi persen'],
      notes:['notes','catatan'],
    },
  },
});

const normalizeHeader = value => String(value || '')
  .replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,' ');

function aliasMap(config){
  const map=new Map();
  for(const header of config.headers) map.set(normalizeHeader(header),header);
  for(const [canonical,aliases] of Object.entries(config.aliases||{})){
    for(const alias of aliases) map.set(normalizeHeader(alias),canonical);
  }
  return map;
}

export function normalizeMasterRows(matrix=[],entity=''){
  const config=configs[entity];
  if(!config) throw new Error('BULK_ENTITY_NOT_SUPPORTED');
  if(!matrix.length) return [];
  const map=aliasMap(config);
  const headers=matrix[0].map(value=>map.get(normalizeHeader(value))||'');
  const present=new Set(headers.filter(Boolean));
  for(const required of config.required){
    if(!present.has(required)) throw new Error(`Kolom wajib tidak ditemukan: ${required}`);
  }
  return matrix.slice(1)
    .filter(row=>row.some(cell=>String(cell??'').trim()!==''))
    .map((row,index)=>{
      const out={_row_number:index+2};
      headers.forEach((key,column)=>{ if(key) out[key]=String(row[column]??'').trim(); });
      return out;
    });
}

export async function parseBulkMasterFile(file,entity){
  const name=String(file?.name||'').toLowerCase();
  const matrix=name.endsWith('.xlsx')
    ? await parseXlsx(await file.arrayBuffer())
    : parseDelimited(await file.text());
  return normalizeMasterRows(matrix,entity);
}

export function masterTemplateCsv(entity){
  const config=configs[entity];
  if(!config) throw new Error('BULK_ENTITY_NOT_SUPPORTED');
  return '\uFEFF'+config.headers.join(',')+'\n';
}

export function masterEntityConfig(entity){
  return configs[entity] || null;
}

export const MASTER_ENTITIES=Object.freeze(Object.keys(configs));
export const __test={configs,normalizeHeader};
