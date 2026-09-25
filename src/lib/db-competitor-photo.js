// ProQTrack — Competitor intelligence + field photo local DB domain
// Kept dependency-injected so db.js remains the single public API and authority boundary.

import { seedPromoTypes } from '../data/seed.js';
import { uid, sanitizePlainText } from './utils.js';

export const FIELD_PHOTO_TYPES = [
  { code: 'location',   label: 'Lokasi (tampak toko)' },
  { code: 'product',    label: 'Produk' },
  { code: 'shelf',      label: 'Rak / Display' },
  { code: 'competitor', label: 'Kompetitor' },
];

export function createCompetitorPhotoDomain(deps) {
  const {
    getDB,
    saveDB,
    scoped,
    getActor,
    isOrgAdminRole,
    isProjectAdminRole,
    visibleEmployeeIds,
    assertOrgAdmin,
    assertLoggedIn,
    assertCanAccessEmployee,
    assertOperationalContext,
    withOrg,
  } = deps;

  function getCompetitors() {
    return scoped(getDB().competitors || []);
  }

  function getCompetitor(id) {
    return getCompetitors().find(c => c.id === id);
  }

  function sanitizeCompetitorInput(data = {}) {
    const next = { ...data };
    for (const key of ['name','category','notes','sku','unit']) {
      if (key in next) next[key] = sanitizePlainText(next[key]);
    }
    if ('color' in next && !/^#[0-9a-f]{6}$/i.test(String(next.color || ''))) next.color = '#64748b';
    return next;
  }

  function createCompetitor(data) {
    assertOrgAdmin();
    const c = {
      id: uid('CMP'),
      status: 'active',
      color: '#64748b',
      category: '',
      notes: '',
      ...withOrg(sanitizeCompetitorInput(data)),
    };
    getDB().competitors.push(c);
    saveDB();
    return c;
  }

  function updateCompetitor(id, data) {
    assertOrgAdmin();
    const db = getDB();
    const idx = db.competitors.findIndex(c => c.id === id);
    if (idx === -1) return null;
    db.competitors[idx] = { ...db.competitors[idx], ...sanitizeCompetitorInput(data) };
    saveDB();
    return db.competitors[idx];
  }

  function deleteCompetitor(id) {
    assertOrgAdmin();
    const db = getDB();
    const competitor = db.competitors.find(c => c.id === id);
    if (competitor) competitor.status = 'archived';
    saveDB();
  }

  function getCompetitorProducts() {
    return scoped(getDB().competitorProducts || []);
  }

  function getCompetitorProductsByCompetitor(competitorId) {
    return getCompetitorProducts().filter(p => p.competitorId === competitorId);
  }

  function createCompetitorProduct(data) {
    assertOrgAdmin();
    const p = {
      id: uid('CPD'),
      status: 'active',
      unit: 'pcs',
      typicalPrice: 0,
      sku: '',
      ...withOrg(sanitizeCompetitorInput(data)),
    };
    if (p.typicalPrice != null) p.typicalPrice = Number(p.typicalPrice);
    getDB().competitorProducts.push(p);
    saveDB();
    return p;
  }

  function updateCompetitorProduct(id, data) {
    assertOrgAdmin();
    const db = getDB();
    const idx = db.competitorProducts.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const next = { ...db.competitorProducts[idx], ...sanitizeCompetitorInput(data) };
    if (next.typicalPrice != null) next.typicalPrice = Number(next.typicalPrice);
    db.competitorProducts[idx] = next;
    saveDB();
    return db.competitorProducts[idx];
  }

  function deleteCompetitorProduct(id) {
    assertOrgAdmin();
    const db = getDB();
    const product = db.competitorProducts.find(p => p.id === id);
    if (product) product.status = 'archived';
    saveDB();
  }

  function getCompetitorIntel() {
    const rows = scoped(getDB().competitorIntel || []);
    const actor = getActor();
    if (!actor || isOrgAdminRole(actor.role)) return rows;
    const ids = visibleEmployeeIds(actor);
    return rows.filter(i => ids.has(i.recordedBy) || ids.has(i.employeeId));
  }

  function getCompetitorIntelByOutlet(outletId) {
    return getCompetitorIntel().filter(i => i.outletId === outletId);
  }

  function getCompetitorIntelByVisit(visitId) {
    return getCompetitorIntel().filter(i => i.visitId === visitId);
  }

  function getCompetitorIntelByEmployee(empId) {
    return getCompetitorIntel().filter(i => i.recordedBy === empId);
  }

  function createCompetitorIntel(data) {
    const actor = assertLoggedIn();
    const owner = data.recordedBy || data.employeeId || actor.employeeId;
    if (actor.role === 'employee') {
      if (owner !== actor.employeeId) throw new Error('Akses ditolak');
    } else {
      assertCanAccessEmployee(owner);
    }
    assertOperationalContext(getDB(), data, { product: true });
    const intel = {
      id: uid('INT'),
      ourPrice: 0,
      competitorPrice: 0,
      shelfShare: 0,
      visibility: 'medium',
      hasPromo: false,
      promoType: '',
      promoNotes: '',
      notes: '',
      recordedAt: new Date().toISOString().slice(0, 10),
      ...withOrg(data),
    };
    intel.ourPrice = Number(intel.ourPrice) || 0;
    intel.competitorPrice = Number(intel.competitorPrice) || 0;
    intel.shelfShare = Number(intel.shelfShare) || 0;
    intel.hasPromo = !!(intel.hasPromo || intel.promo) && intel.hasPromo !== 'false';
    if (!intel.hasPromo) {
      intel.promoType = '';
    } else {
      intel.promoType = intel.promoType || '';
    }
    intel.promoNotes = intel.promoNotes != null ? intel.promoNotes : (intel.promoNote || '');
    getDB().competitorIntel.push(intel);
    saveDB();
    return intel;
  }

  function updateCompetitorIntel(id, data) {
    const actor = assertLoggedIn();
    const db = getDB();
    const current = getCompetitorIntel().find(i => i.id === id);
    if (!current) return null;
    const idx = db.competitorIntel.findIndex(i => i.id === id);
    if (idx === -1) return null;
    const owner = current.recordedBy || current.employeeId;
    if (owner) assertCanAccessEmployee(owner);
    else if (!isProjectAdminRole(actor.role)) throw new Error('Akses ditolak');
    const next = { ...db.competitorIntel[idx], ...data };
    if (next.ourPrice != null) next.ourPrice = Number(next.ourPrice);
    if (next.competitorPrice != null) next.competitorPrice = Number(next.competitorPrice);
    if (next.shelfShare != null) next.shelfShare = Number(next.shelfShare);
    if (next.hasPromo != null) next.hasPromo = !!next.hasPromo && next.hasPromo !== 'false';
    if (next.promo != null) next.hasPromo = !!next.promo;
    if (!next.hasPromo) next.promoType = next.promoType || '';
    db.competitorIntel[idx] = next;
    saveDB();
    return db.competitorIntel[idx];
  }

  function getPromoTypes() {
    const list = getDB().promoTypes;
    if (!list || !list.length) return JSON.parse(JSON.stringify(seedPromoTypes));
    return list;
  }

  function getPromoTypeLabel(code, customNote = '') {
    if (!code) return '';
    const t = getPromoTypes().find(p => p.code === code);
    if (!t) return code;
    if (code === 'custom' && customNote) return customNote;
    return t.label;
  }

  function getFieldPhotos() {
    const rows = scoped(getDB().fieldPhotos || []);
    const actor = getActor();
    if (!actor || isOrgAdminRole(actor.role)) return rows;
    const ids = visibleEmployeeIds(actor);
    return rows.filter(p => ids.has(p.employeeId) || ids.has(p.recordedBy));
  }

  function getFieldPhotosByEmployee(empId) {
    return getFieldPhotos().filter(p => p.recordedBy === empId || p.employeeId === empId);
  }

  function getFieldPhotosByOutlet(outletId) {
    return getFieldPhotos().filter(p => p.outletId === outletId);
  }

  function getFieldPhotosByVisit(visitId) {
    return getFieldPhotos().filter(p => p.visitId === visitId);
  }

  function getAccessibleFieldPhotos(empId, isManagerRole) {
    if (isManagerRole) return getFieldPhotos();
    if (!empId) return [];
    return getFieldPhotosByEmployee(empId);
  }

  function createFieldPhoto(data) {
    const actor = assertLoggedIn();
    const owner = data.employeeId || data.recordedBy || actor.employeeId;
    if (actor.role === 'employee') {
      if (owner !== actor.employeeId) throw new Error('Akses ditolak');
    } else if (actor.role !== 'manager') {
      assertCanAccessEmployee(owner);
    }
    assertOperationalContext(getDB(), data, { product: !!data.productId });
    const photo = {
      id: uid('PHO'),
      visitId: null,
      outletId: '',
      type: 'location',
      caption: '',
      productId: null,
      competitorId: null,
      dataUrl: null,
      recordedAt: new Date().toISOString(),
      ...withOrg(data),
    };
    if (!photo.productId) photo.productId = null;
    if (!photo.competitorId) photo.competitorId = null;
    getDB().fieldPhotos.push(photo);
    saveDB();
    return photo;
  }

  function updateFieldPhoto(id, data) {
    const db = getDB();
    const idx = db.fieldPhotos.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const owner = db.fieldPhotos[idx].employeeId || db.fieldPhotos[idx].recordedBy;
    if (owner) assertCanAccessEmployee(owner);
    db.fieldPhotos[idx] = { ...db.fieldPhotos[idx], ...data };
    saveDB();
    return db.fieldPhotos[idx];
  }

  function deleteFieldPhoto(id) {
    assertLoggedIn();
    const db = getDB();
    const photo = (db.fieldPhotos || []).find(p => p.id === id);
    if (!photo) return;
    const owner = photo.employeeId || photo.recordedBy;
    if (owner) assertCanAccessEmployee(owner);
    db.fieldPhotos = db.fieldPhotos.filter(p => p.id !== id);
    saveDB();
  }

  function deleteCompetitorIntel(id) {
    assertLoggedIn();
    const db = getDB();
    const intel = (db.competitorIntel || []).find(i => i.id === id);
    const owner = intel?.recordedBy || intel?.employeeId;
    if (owner) assertCanAccessEmployee(owner);
    db.competitorIntel = db.competitorIntel.filter(i => i.id !== id);
    saveDB();
  }

  function getCompetitorAnalysisSummary() {
    const competitors = getCompetitors();
    const products = getCompetitorProducts();
    const intel = getCompetitorIntel();

    return competitors.map(c => {
      const cpdIds = products.filter(p => p.competitorId === c.id).map(p => p.id);
      const rows = intel.filter(i => cpdIds.includes(i.competitorProductId));
      if (rows.length === 0) {
        return {
          competitorId: c.id,
          name: c.name,
          color: c.color,
          category: c.category,
          status: c.status,
          intelCount: 0,
          avgPriceGap: 0,
          avgShelfShare: 0,
          promoCount: 0,
          cheaperCount: 0,
          moreExpensiveCount: 0,
        };
      }
      let gapSum = 0;
      let shareSum = 0;
      let promoCount = 0;
      let cheaperCount = 0;
      let moreExpensiveCount = 0;
      rows.forEach(r => {
        const gap = r.ourPrice - r.competitorPrice;
        gapSum += gap;
        shareSum += r.shelfShare || 0;
        if (r.hasPromo) promoCount++;
        if (r.competitorPrice < r.ourPrice) cheaperCount++;
        if (r.competitorPrice > r.ourPrice) moreExpensiveCount++;
      });
      return {
        competitorId: c.id,
        name: c.name,
        color: c.color,
        category: c.category,
        status: c.status,
        intelCount: rows.length,
        avgPriceGap: Math.round(gapSum / rows.length),
        avgShelfShare: Math.round(shareSum / rows.length),
        promoCount,
        cheaperCount,
        moreExpensiveCount,
      };
    });
  }

  return {
    getCompetitors,
    getCompetitor,
    createCompetitor,
    updateCompetitor,
    deleteCompetitor,
    getCompetitorProducts,
    getCompetitorProductsByCompetitor,
    createCompetitorProduct,
    updateCompetitorProduct,
    deleteCompetitorProduct,
    getCompetitorIntel,
    getCompetitorIntelByOutlet,
    getCompetitorIntelByVisit,
    getCompetitorIntelByEmployee,
    createCompetitorIntel,
    updateCompetitorIntel,
    getPromoTypes,
    getPromoTypeLabel,
    getFieldPhotos,
    getFieldPhotosByEmployee,
    getFieldPhotosByOutlet,
    getFieldPhotosByVisit,
    getAccessibleFieldPhotos,
    createFieldPhoto,
    updateFieldPhoto,
    deleteFieldPhoto,
    deleteCompetitorIntel,
    getCompetitorAnalysisSummary,
  };
}
