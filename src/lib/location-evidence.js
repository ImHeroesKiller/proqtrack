import { runtimeTimezone } from './utils.js';

export function validCoordinatePair(latValue, lngValue) {
  if (latValue === '' || latValue == null || lngValue === '' || lngValue == null) return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function visitLocationEvidence(visit = {}, outlet = null) {
  const checkIn = validCoordinatePair(visit.checkInLat, visit.checkInLng);
  if (checkIn) {
    const source = visit.locationSource === 'device_gps' ? 'device_gps' : (visit.locationSource || 'checkin_coordinate');
    const administrative = ['outlet_reference','administrative_entry','administrative_checkin'].includes(source);
    const rawAccuracy = visit.checkInAccuracyM;
    return {
      ...checkIn,
      source,
      actual: !administrative,
      accuracyM: rawAccuracy == null || rawAccuracy === '' ? null : (Number.isFinite(Number(rawAccuracy)) ? Math.max(0, Number(rawAccuracy)) : null),
      capturedAt: visit.checkInCapturedAt || null,
    };
  }

  const legacy = validCoordinatePair(visit.lat, visit.lng);
  if (legacy) {
    const source = visit.locationSource || 'visit_coordinate';
    const administrative = ['outlet_reference','administrative_entry','administrative_checkin'].includes(source);
    const rawAccuracy = visit.accuracyM;
    return {
      ...legacy,
      source,
      actual: !administrative,
      accuracyM: rawAccuracy == null || rawAccuracy === '' ? null : (Number.isFinite(Number(rawAccuracy)) ? Math.max(0, Number(rawAccuracy)) : null),
      capturedAt: visit.locationCapturedAt || visit.startedAt || null,
    };
  }

  const reference = validCoordinatePair(outlet?.lat, outlet?.lng);
  if (reference) {
    return {
      ...reference,
      source: 'outlet_reference',
      actual: false,
      accuracyM: null,
      capturedAt: null,
    };
  }
  return null;
}

export function locationSourceLabel(evidence) {
  if (!evidence) return 'Belum ada lokasi';
  if (evidence.source === 'device_gps') return 'GPS perangkat';
  if (evidence.source === 'checkin_coordinate' || evidence.source === 'visit_coordinate') return 'Koordinat check-in';
  if (evidence.source === 'outlet_reference') return 'Referensi outlet';
  if (evidence.source === 'administrative_checkin') return 'Check-in administratif';
  return 'Koordinat kunjungan';
}

export function locationFreshness(evidence, visit = {}, now = Date.now(), today = '') {
  if (!evidence) return { key:'none', label:'Belum ada lokasi' };
  if (!evidence.actual) return { key:'reference', label:'Lokasi outlet — bukan posisi perangkat' };

  const captured = evidence.capturedAt ? Date.parse(evidence.capturedAt) : NaN;
  if (Number.isFinite(captured)) {
    const minutes = Math.max(0, Math.floor((now - captured) / 60000));
    if (minutes <= 15) return { key:'fresh', label: minutes <= 1 ? 'GPS baru saja' : `GPS ${minutes} menit lalu` };
    if (minutes <= 120) return { key:'recent', label:`GPS ${minutes} menit lalu` };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { key:'stale', label:`GPS ${hours} jam lalu` };
    return { key:'stale', label:'GPS lama' };
  }

  const day = String(visit.date || visit.visitDate || '').slice(0,10);
  if (today && day === today) return { key:'today', label:'Koordinat check-in hari ini' };
  return { key:'stale', label:'Koordinat check-in lama' };
}

export function currentTenantTimeHHMM(timeZone = runtimeTimezone(), date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour:'2-digit',
    minute:'2-digit',
    hour12:false,
  }).formatToParts(date);
  const hour = parts.find(part => part.type === 'hour')?.value || '00';
  const minute = parts.find(part => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

export function captureDevicePosition(geolocation = (typeof navigator !== 'undefined' ? navigator.geolocation : null)) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(Object.assign(new Error('GPS tidak tersedia di perangkat ini.'), { code:'GPS_UNAVAILABLE' }));
      return;
    }
    geolocation.getCurrentPosition(position => {
      const pair = validCoordinatePair(position?.coords?.latitude, position?.coords?.longitude);
      if (!pair) {
        reject(Object.assign(new Error('Koordinat GPS tidak valid.'), { code:'GPS_INVALID' }));
        return;
      }
      const accuracy = Number(position.coords.accuracy);
      resolve({
        ...pair,
        accuracyM:Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
        capturedAt:new Date(position.timestamp || Date.now()).toISOString(),
      });
    }, error => {
      reject(Object.assign(
        new Error(error?.code === 1
          ? 'Izin lokasi diperlukan untuk check-in.'
          : 'GPS belum mendapatkan lokasi yang valid. Coba lagi.'),
        { code:error?.code === 1 ? 'GPS_PERMISSION_REQUIRED' : 'GPS_POSITION_FAILED' },
      ));
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
  });
}
