// ProQTrack P2 route chunk: Stock + Sales renderers
export function renderProductSales(ctx, { mine = false } = {}) {
  const {
    myEmployeeId, getProducts, getOutlets, getEmployees, getProductSales, isProjectAdmin,
    getProductSalesAudit, pendingManualCorrections, salesSummary, todayISO, formatCurrency,
    jsArg, esc, formatDateShort,
  } = ctx;
  const employeeId = myEmployeeId();
  const products = Object.fromEntries(getProducts().map(row => [row.id,row]));
  const outlets = Object.fromEntries(getOutlets().map(row => [row.id,row]));
  const employees = Object.fromEntries(getEmployees().map(row => [row.id,row]));
  const rows = getProductSales()
    .filter(row => !mine || String(row.employeeId || '') === String(employeeId || ''))
    .sort((a,b) => String(b.soldAt || b.date || '').localeCompare(String(a.soldAt || a.date || '')));
  const manualAllowed = !mine && isProjectAdmin();
  const auditRows = getProductSalesAudit();
  const pendingCorrections = manualAllowed ? pendingManualCorrections(auditRows) : [];
  const salesTotals = salesSummary(rows);
  const totalQty = salesTotals.quantity;
  const totalAmount = salesTotals.amount;
  const manualCount = salesTotals.manual;
  const thisMonth = todayISO().slice(0,7);
  queueMicrotask(()=>window.FT?.filterProductSales?.());
  return `
    ${pendingCorrections.length ? `<div class="card" style="margin-bottom:16px;border-color:var(--amber-300);background:var(--amber-50)">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div><strong>${pendingCorrections.length} koreksi manual belum memiliki replacement</strong><div class="am-muted">Sumber sudah di-void dan tetap tersimpan di audit trail.</div></div>
        <div class="spacer"></div>
        ${pendingCorrections.slice(0,3).map(row=>`<button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openManualSaleModal(${jsArg(row.id)})">Lanjut ${esc(row.id)}</button>`).join('')}
      </div>
    </div>` : ''}
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Transaksi aktif</div><div class="stat-value" id="salesKpiTransactions">${rows.length}</div></div>
      <div class="stat-card"><div class="stat-label">Qty terjual</div><div class="stat-value" id="salesKpiQty">${totalQty}</div></div>
      <div class="stat-card"><div class="stat-label">Nilai penjualan</div><div class="stat-value" id="salesKpiAmount" style="font-size:20px">${formatCurrency(totalAmount)}</div><div class="am-muted" id="salesKpiManual">${manualCount} manual exception</div></div>
    </div>
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="salesSearch" placeholder="Cari employee, outlet, produk..." data-pqt-oninput="FT.filterProductSales()">
        <select class="select" id="salesSourceFilter" style="width:170px" data-pqt-onchange="FT.filterProductSales()">
          <option value="">Semua sumber</option><option value="derived">Derived Stock</option><option value="manual">Manual Exception</option>
        </select>
        <input class="input" id="salesFromFilter" type="date" value="${thisMonth}-01" data-pqt-onchange="FT.filterProductSales()" style="width:155px">
        <input class="input" id="salesToFilter" type="date" value="${todayISO()}" data-pqt-onchange="FT.filterProductSales()" style="width:155px">
        <div class="spacer"></div>
        <span id="salesResultSummary" class="am-muted"></span>
        ${manualAllowed ? '<button class="btn btn-primary" data-pqt-onclick="FT.openManualSaleModal()">+ Manual Exception</button>' : ''}
      </div>
      <div class="card-subtitle" style="margin-bottom:12px">Penjualan otomatis berasal dari pergerakan stok yang sudah difinalisasi. Transaksi manual hanya dipakai untuk pengecualian atau koreksi dan tetap memiliki jejak audit.</div>
      <div class="visits-table-wrapper">
        <table class="table" id="productSalesTable"><thead><tr><th>Tanggal</th><th>Employee</th><th>Outlet</th><th>Produk</th><th>Qty</th><th>Nilai</th><th>Sumber</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(row => {
            const provenance=String(row.provenance || 'manual_legacy');
            const manual=!['derived_stock','inventory_cycle'].includes(provenance);
            const date=String(row.soldAt || row.date || '').slice(0,10);
            const search=[employees[row.employeeId]?.name,row.employeeId,outlets[row.outletId]?.name,row.outletId,products[row.productId]?.name,products[row.productId]?.sku].filter(Boolean).join(' ').toLowerCase();
            return `<tr data-search="${esc(search)}" data-source="${manual?'manual':'derived'}" data-date="${esc(date)}" data-qty="${Number(row.quantity ?? row.qty ?? 0)}" data-amount="${Number(row.totalAmount ?? row.amount ?? 0)}">
              <td>${formatDateShort(date)}</td>
              <td>${esc(employees[row.employeeId]?.name || row.employeeId || '-')}</td>
              <td>${esc(outlets[row.outletId]?.name || row.outletId || '-')}</td>
              <td>${esc(products[row.productId]?.name || row.productId || '-')}</td>
              <td>${Number(row.quantity ?? row.qty ?? 0)}</td>
              <td>${formatCurrency(Number(row.totalAmount ?? row.amount ?? 0))}</td>
              <td>${manual ? '<span class="badge badge-warning">Manual Exception</span>' : '<span class="badge badge-success">Derived Stock</span>'}</td>
              <td>${manualAllowed && manual ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.correctManualSale(${jsArg(row.id)})">Koreksi</button>` : ''}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="8"><div class="empty-state"><h3>Belum ada penjualan</h3><p>Penjualan akan muncul setelah Inventory Cycle difinalisasi.</p></div></td></tr>'}</tbody>
        </table>
      </div>
      <div id="salesEmptyFilter" class="empty-state" hidden><h3>Tidak ada transaksi sesuai filter</h3><p>Ubah periode, sumber, atau kata pencarian.</p></div>
    </div>`;
}


export function renderStocks(ctx) {
  const {
    getProducts, getOutlets, getStocks, stockSummary, stockProjectRows, esc,
    formatOutletLabel, outletIcon, formatDateShort,
  } = ctx;
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const stocks = getStocks().filter(s => productMap[s.productId] && outletMap[s.outletId]);
  const stockTotals = stockSummary(stocks);
  const lowStocks = stocks.filter(s => Number(s.quantity||0) <= Number(s.minStock||0));
  const projectRows = stockProjectRows();

  return `
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Saldo stok</div><div class="stat-value">${stockTotals.total}</div></div>
      <div class="stat-card"><div class="stat-label">Stok menipis</div><div class="stat-value">${stockTotals.low}</div></div>
      <div class="stat-card"><div class="stat-label">Stok habis</div><div class="stat-value">${stockTotals.empty}</div></div>
    </div>
    ${lowStocks.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-color:var(--red-500); background:var(--red-50);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:32px;">⚠️</div>
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--red-700);">${lowStocks.length} Produk Stok Menipis</div>
            <div style="font-size:13px; color:var(--red-500);">Segera lakukan restock ke outlet berikut</div>
          </div>
        </div>
      </div>
    ` : ''}
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="stockSearch" placeholder="🔍 Cari stok..." data-pqt-oninput="FT.filterStocks()">
        <select class="select" id="stockProjectFilter" style="width:190px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Project</option>
          ${projectRows.map(p=>`<option value="${p.id}">${esc(p.name||p.code||p.id)}</option>`).join('')}
        </select>
        <select class="select" id="stockOutletFilter" style="width:200px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Outlet</option>
          ${getOutlets().map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
        </select>
        <select class="select" id="stockStatusFilter" style="width:160px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Status</option>
          <option value="low">Stok Menipis</option>
          <option value="ok">Stok Aman</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openStockModal()">+ Stock Movement</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="stockTable">
          <thead><tr><th>Outlet</th><th>Produk</th><th>Qty</th><th>Min. Stok</th><th>Status</th><th>Update</th><th></th></tr></thead>
          <tbody>
            ${stocks.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📊</div><h3>Belum ada data stok</h3></div></td></tr>` :
            stocks.map(s => {
              const p = productMap[s.productId]; const o = outletMap[s.outletId];
              if (!p || !o) return '';
              const isLow = s.quantity <= s.minStock;
              return `
                <tr data-project="${esc(s.projectId||'')}" data-outlet="${esc(s.outletId||'')}" data-status="${isLow?'low':'ok'}">
                  <td>${outletIcon(o.type)} ${esc(o.name)}</td>
                  <td><span style="font-weight:600;">${esc(p.name)}</span><br><span style="font-size:11px; color:var(--gray-400);">${esc(p.sku||'-')}</span></td>
                  <td style="font-weight:700; color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewStockHistory('${s.id}')">Riwayat</button>
                    <button class="btn btn-secondary btn-sm" style="margin-left:4px" data-pqt-onclick="FT.editStock('${s.id}')">Adjustment</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
