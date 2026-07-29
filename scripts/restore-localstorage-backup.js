(() => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const storage = payload?.storage || {};
      const allowedKeys = ['proqtrack_db_v6', 'proqtrack_db_v7'];
      let restored = 0;

      for (const key of allowedKeys) {
        if (typeof storage[key] === 'string' && storage[key].length) {
          JSON.parse(storage[key]);
          localStorage.setItem(key, storage[key]);
          restored += 1;
        }
      }

      if (!restored) throw new Error('Backup tidak berisi proqtrack_db_v6/v7 yang valid.');
      alert(`Restore berhasil untuk ${restored} key. Halaman akan dimuat ulang.`);
      location.reload();
    } catch (error) {
      console.error(error);
      alert(`Restore gagal: ${error.message || error}`);
    }
  });
  input.click();
})();
