const text = value => String(value ?? '').trim();

export function stockSalesFriendlyErrorMessage(error = '') {
  const code = text(error?.code || error?.message || error);
  return ({
    INVENTORY_CYCLE_PERIOD_CONFLICT:'Cycle stok untuk outlet/produk ini sudah ada pada tanggal yang sama. Gunakan data cycle yang sudah difinalisasi atau lakukan koreksi pada cycle berikutnya.',
    INVENTORY_CYCLE_OPENING_MISMATCH:'Saldo opening berubah karena ada update terbaru. Data akan dimuat ulang; periksa saldo lalu submit kembali.',
    REVISION_CONFLICT:'Data terbaru berubah dari perangkat lain. Versi terbaru akan dimuat ulang.',
    CLOUD_SYNC_TIMEOUT:'Sinkronisasi belum selesai. Periksa koneksi lalu coba kembali.',
    CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi online belum siap. Muat ulang aplikasi lalu coba kembali.',
    MANUAL_SALE_IDEMPOTENCY_CONFLICT:'Transaksi manual yang sama sudah pernah tersimpan.',
    MANUAL_SALE_CORRECTION_SOURCE_NOT_VOIDED:'Transaksi sumber harus di-void terlebih dahulu sebelum replacement dibuat.',
  })[code] || error?.message || String(error || '');
}

export function inventoryCycleOnDate(cycles = [], projectId = '', outletId = '', productId = '', date = '') {
  return (cycles || []).find(row =>
    text(row?.projectId) === text(projectId)
    && text(row?.outletId) === text(outletId)
    && text(row?.productId) === text(productId)
    && text(row?.cycleDate) === text(date)
  ) || null;
}

export function commonProjectIds(outlet = {}, product = {}) {
  const outletProjects = new Set((outlet?.projectIds || []).map(String));
  return [...new Set((product?.projectIds || []).map(String).filter(id => outletProjects.has(id)))];
}

export function stockSummary(stocks = []) {
  return {
    total:stocks.length,
    low:stocks.filter(row => Number(row?.quantity || 0) <= Number(row?.minStock || 0)).length,
    empty:stocks.filter(row => Number(row?.quantity || 0) <= 0).length,
  };
}

export function stockFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function' ? text(source(key)) : text(source?.[key]);
  return {
    search:get('search').toLowerCase(),
    projectId:get('projectId'),
    outletId:get('outletId'),
    status:get('status'),
  };
}

export function stockMatchesFilters(row = {}, filters = {}) {
  const haystack = text(row.search || row.text).toLowerCase();
  return (!filters.search || haystack.includes(filters.search))
    && (!filters.projectId || text(row.projectId) === filters.projectId)
    && (!filters.outletId || text(row.outletId) === filters.outletId)
    && (!filters.status || text(row.status) === filters.status);
}

export function salesSummary(rows = []) {
  return rows.reduce((summary,row) => {
    const provenance = text(row?.provenance || 'manual_legacy');
    summary.transactions += 1;
    summary.quantity += Number(row?.quantity ?? row?.qty ?? 0);
    summary.amount += Number(row?.totalAmount ?? row?.amount ?? 0);
    if (!['derived_stock','inventory_cycle'].includes(provenance)) summary.manual += 1;
    return summary;
  }, { transactions:0, quantity:0, amount:0, manual:0 });
}

export function salesFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function' ? text(source(key)) : text(source?.[key]);
  return {
    search:get('search').toLowerCase(),
    source:get('source'),
    from:get('from'),
    to:get('to'),
  };
}

export function salesMatchesFilters(row = {}, filters = {}) {
  const date = text(row.date);
  return (!filters.search || text(row.search).toLowerCase().includes(filters.search))
    && (!filters.source || text(row.source) === filters.source)
    && (!filters.from || date >= filters.from)
    && (!filters.to || date <= filters.to);
}

export function pendingManualCorrections(auditRows = []) {
  const replacements = new Set(
    auditRows
      .filter(row => text(row?.lifecycleStatus || 'active') !== 'voided' && row?.correctionOfSaleId)
      .map(row => text(row.correctionOfSaleId))
  );
  return auditRows.filter(row =>
    text(row?.lifecycleStatus || 'active') === 'voided'
    && !['derived_stock','inventory_cycle'].includes(text(row?.provenance || 'manual_legacy'))
    && !replacements.has(text(row?.id))
  );
}

export function validateStockMovementInput({ openingQty = 0, stockInQty = 0, closingQty = 0, minStock = 0 } = {}) {
  const opening = Number(openingQty);
  const stockIn = Number(stockInQty);
  const closing = Number(closingQty);
  const minimum = Number(minStock);
  if (![opening,stockIn,closing,minimum].every(Number.isFinite) || opening < 0 || stockIn < 0 || closing < 0 || minimum < 0) {
    return { ok:false, error:'STOCK_VALUES_INVALID' };
  }
  const available = opening + stockIn;
  if (closing > available) return { ok:false, error:'STOCK_CLOSING_EXCEEDS_AVAILABLE', available };
  return { ok:true, openingQty:opening, stockInQty:stockIn, closingQty:closing, minStock:minimum, available, sellOutQty:available-closing };
}
