// ProQTrack P2 route chunk: competitor master + analysis
import {
  getCompetitors, getCompetitorProducts, getCompetitorAnalysisSummary, getCompetitorIntel,
  getProducts, getOutlets, getEmployees, getPromoTypes, getPromoTypeLabel,
} from '../lib/db.js';
import {
  esc, statusBadge, formatCurrency, formatDateShort, outletIcon, visibilityBadge,
} from '../lib/utils.js';

const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
const jsArg = value => esc(JSON.stringify(String(value ?? '')));
const role = () => String(window.FT?.state?.account?.role || '');
const isOrgAdmin = () => ['superadmin','head','admin'].includes(role());

function promoBadgeHTML(intel) {
  if (!intel.hasPromo) return '—';
  const label = getPromoTypeLabel(intel.promoType, intel.promoType === 'custom' ? intel.promoNotes : '')
    || intel.promoNotes
    || 'Promo';
  const pt = getPromoTypes().find(p => p.code === intel.promoType);
  const strategic = pt?.strategic;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${strategic ? '#fef3c7' : '#fff7ed'};color:${strategic ? '#b45309' : 'var(--amber)'};max-width:140px;line-height:1.3;" title="${(intel.promoNotes || '').replace(/"/g, '&quot;')}">${label}${strategic ? ' ★' : ''}</span>`;
}

export function renderCompetitors() {
  const competitors = getCompetitors();
  const cpd = getCompetitorProducts();
  const byComp = {};
  cpd.forEach(p => { if (!byComp[p.competitorId]) byComp[p.competitorId] = []; byComp[p.competitorId].push(p); });

  return `
    <div class="grid-2" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--purple-50);color:var(--purple);">◇</div>
        <div class="stat-label">Merek Kompetitor</div>
        <div class="stat-value">${competitors.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber);">▦</div>
        <div class="stat-label">Produk Kompetitor</div>
        <div class="stat-value">${cpd.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="filter-row">
        <div class="card-title" style="margin:0;">Master Kompetitor</div>
        <div class="spacer"></div>
        ${isOrgAdmin() ? `
        <button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('competitors')">Bulk Merek</button>
        <button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('competitorProducts')">Bulk Produk</button>
        <button class="btn btn-secondary" data-pqt-onclick="FT.openCompetitorProductModal()">+ Produk Kompetitor</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openCompetitorModal()">+ Merek Kompetitor</button>
        ` : ''}
      </div>
      <div class="card-subtitle">Kelola merek pesaing & katalog produknya</div>

      ${competitors.length === 0 ? `<div class="empty-state"><div class="empty-icon">◇</div><h3>Belum ada kompetitor</h3></div>` : `
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
        ${competitors.map(c => {
          const prods = byComp[c.id] || [];
          return `
            <div style="border:1px solid var(--gray-200); border-radius:var(--radius); padding:14px; background:var(--gray-50);">
              <div style="display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="width:14px;height:14px;border-radius:4px;background:${safeColor(c.color)};margin-top:4px;flex-shrink:0;"></div>
                <div style="flex:1;min-width:140px;">
                  <div style="font-weight:700;font-size:15px;color:var(--gray-900);">${esc(c.name)} ${statusBadge(c.status)}</div>
                  <div style="font-size:12px;color:var(--gray-400);margin-top:2px;">${esc(c.category || '—')} · ${prods.length} produk</div>
                  ${c.notes ? `<div style="font-size:12px;color:var(--gray-500);margin-top:6px;">${esc(c.notes)}</div>` : ''}
                </div>
                <div style="display:${isOrgAdmin() ? 'flex' : 'none'};gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openCompetitorProductModal(${jsArg(c.id)})">+ Produk</button>
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editCompetitor(${jsArg(c.id)})">Edit</button>
                  <button class="btn btn-danger btn-sm" data-pqt-onclick="FT.deleteCompetitorConfirm(${jsArg(c.id)})">Arsipkan</button>
                </div>
              </div>
              ${prods.length ? `
                <div class="visits-table-wrapper" style="margin-top:12px;">
                  <table class="table" style="min-width:400px;background:white;border-radius:8px;">
                    <thead><tr><th>SKU</th><th>Nama</th><th>Harga Tipikal</th><th>Unit</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      ${prods.map(p => `
                        <tr>
                          <td style="font-family:monospace;font-size:11px;color:var(--gray-500);">${esc(p.sku||'—')}</td>
                          <td style="font-weight:600;">${esc(p.name)}</td>
                          <td>${formatCurrency(p.typicalPrice)}</td>
                          <td>${esc(p.unit)}</td>
                          <td>${statusBadge(p.status)}</td>
                          <td style="display:${isOrgAdmin() ? 'table-cell' : 'none'};">
                            <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editCompetitorProduct(${jsArg(p.id)})">Edit</button>
                            <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteCompetitorProductConfirm(${jsArg(p.id)})">Arsipkan</button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `<div style="margin-top:10px;font-size:12px;color:var(--gray-400);">Belum ada produk kompetitor</div>`}
            </div>
          `;
        }).join('')}
      </div>
      `}
    </div>
  `;
}


export function renderCompetitorAnalysis() {
  const summary = getCompetitorAnalysisSummary();
  const intel = [...getCompetitorIntel()].sort((a, b) => (b.recordedAt||'').localeCompare(a.recordedAt||''));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const cpdMap = Object.fromEntries(getCompetitorProducts().map(p => [p.id, p]));
  const compMap = Object.fromEntries(getCompetitors().map(c => [c.id, c]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));

  const totalIntel = intel.length;
  const avgShare = totalIntel ? Math.round(intel.reduce((s, i) => s + (i.shelfShare || 0), 0) / totalIntel) : 0;
  const promoCount = intel.filter(i => i.hasPromo).length;
  const weLosePrice = intel.filter(i => i.ourPrice > i.competitorPrice).length;

  return `
    <div class="grid-4" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">◇</div>
        <div class="stat-label">Total Intel</div>
        <div class="stat-value">${totalIntel}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">▥</div>
        <div class="stat-label">Avg Shelf Share Kita</div>
        <div class="stat-value">${avgShare}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber);">▣</div>
        <div class="stat-label">Intel Ada Promo</div>
        <div class="stat-value">${promoCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--red-50);color:var(--red);">↓</div>
        <div class="stat-label">Kita Lebih Mahal</div>
        <div class="stat-value">${weLosePrice}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Ringkasan per Merek</div>
      <div class="card-subtitle">Avg price gap = harga kita − harga kompetitor (positif = kita lebih mahal)</div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Merek</th><th>Kategori</th><th>Intel</th>
              <th>Avg Price Gap</th><th>Avg Shelf Share</th>
              <th>Promo</th><th>Lebih Murah</th><th>Lebih Mahal</th>
            </tr>
          </thead>
          <tbody>
            ${summary.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><h3>Belum ada data</h3></div></td></tr>` :
            summary.map(s => {
              const gapColor = s.avgPriceGap > 0 ? 'var(--red)' : s.avgPriceGap < 0 ? 'var(--green)' : 'var(--gray-500)';
              const gapLabel = s.intelCount
                ? (s.avgPriceGap > 0 ? `+${formatCurrency(s.avgPriceGap)}` : formatCurrency(s.avgPriceGap))
                : '—';
              return `
                <tr>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;">
                      <span style="width:10px;height:10px;border-radius:3px;background:${s.color||'#94a3b8'};"></span>
                      ${s.name}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--gray-500);">${s.category||'—'}</td>
                  <td style="font-weight:700;">${s.intelCount}</td>
                  <td style="font-weight:600;color:${gapColor};">${gapLabel}</td>
                  <td>
                    ${s.intelCount ? `
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div class="progress-bar" style="width:64px;"><div class="progress-fill" style="width:${Math.min(100,s.avgShelfShare)}%;"></div></div>
                        <span style="font-weight:600;">${s.avgShelfShare}%</span>
                      </div>
                    ` : '—'}
                  </td>
                  <td>${s.promoCount}</td>
                  <td style="color:var(--red);font-weight:600;" title="Berapa kali harga kompetitor lebih murah">${s.cheaperCount}</td>
                  <td style="color:var(--green);font-weight:600;">${s.moreExpensiveCount}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Riwayat Intel Lapangan</div>
      <div class="card-subtitle">Semua observasi dari field sales & supervisor</div>
      ${intel.length === 0 ? `<div class="empty-state"><div class="empty-icon">◇</div><h3>Belum ada intel</h3></div>` : `
      <div class="visits-table-wrapper">
        <table class="table" style="min-width:720px;">
          <thead>
            <tr>
              <th>Tanggal</th><th>Sales</th><th>Outlet</th>
              <th>Produk Kita</th><th>Kompetitor</th>
              <th>Harga Kita</th><th>Harga Kompetitor</th>
              <th>Gap</th><th>Shelf %</th><th>Vis</th><th>Promo</th><th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${intel.map(i => {
              const our = productMap[i.productId];
              const cp = cpdMap[i.competitorProductId];
              const comp = cp ? compMap[cp.competitorId] : null;
              const o = outletMap[i.outletId];
              const emp = empMap[i.recordedBy || i.employeeId];
              const gap = (i.ourPrice || 0) - (i.competitorPrice || 0);
              const gapColor = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--green)' : 'var(--gray-400)';
              return `
                <tr>
                  <td style="font-size:12px;">${formatDateShort(i.recordedAt)}</td>
                  <td style="font-size:12px;">${esc(emp?.name?.split(' ')[0] || '—')}</td>
                  <td>${o ? outletIcon(o.type)+' '+o.name : i.outletId}</td>
                  <td><span style="font-weight:600;">${our?.name || '—'}</span><br><span style="font-size:11px;color:var(--gray-400);">${our?.brand||''}</span></td>
                  <td>
                    <span style="font-weight:600;">${cp?.name || '—'}</span>
                    <br><span style="font-size:11px;color:${comp?.color||'var(--gray-400)'};">${comp?.name||''}</span>
                  </td>
                  <td style="font-weight:600;">${formatCurrency(i.ourPrice)}</td>
                  <td style="font-weight:600;">${formatCurrency(i.competitorPrice)}</td>
                  <td style="font-weight:700;color:${gapColor};">${gap===0?'—':(gap>0?'+':'')+formatCurrency(gap).replace('Rp ','Rp ')}</td>
                  <td style="font-weight:600;">${i.shelfShare != null && i.shelfShare !== '' ? `${i.shelfShare}%` : '—'}</td>
                  <td>${visibilityBadge(i.visibility)}</td>
                  <td>${promoBadgeHTML(i)}</td>
                  <td style="font-size:11px;color:var(--gray-500);max-width:140px;">${i.promoNotes || i.notes || '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>
  `;
}

