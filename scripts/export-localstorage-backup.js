(() => {
  const keys = ['proqtrack_db_v6', 'proqtrack_db_v7'];
  const payload = {
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    href: location.href,
    storage: Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `proqtrack-localstorage-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  console.info('ProQTrack localStorage backup exported.', {
    keys,
    hasV6: Boolean(payload.storage.proqtrack_db_v6),
    hasV7: Boolean(payload.storage.proqtrack_db_v7),
  });
})();
