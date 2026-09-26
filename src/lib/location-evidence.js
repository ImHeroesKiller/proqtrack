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

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [aLat, aLng, bLat, bLng] = values;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function visitGeofenceEvidence(outlet, gps, defaultRadiusM = 50) {
  const outletLat = Number(outlet?.lat ?? outlet?.latitude);
  const outletLng = Number(outlet?.lng ?? outlet?.longitude);
  const gpsLat = Number(gps?.lat);
  const gpsLng = Number(gps?.lng);
  if (![outletLat, outletLng, gpsLat, gpsLng].every(Number.isFinite)) {
    throw Object.assign(new Error('Outlet belum memiliki koordinat valid untuk check-in.'), { code:'VISIT_GEOFENCE_UNAVAILABLE' });
  }
  const configuredRadius = Number(outlet?.geofenceRadiusM ?? outlet?.radiusM);
  const radiusM = Number.isFinite(configuredRadius) && configuredRadius > 0 ? configuredRadius : defaultRadiusM;
  const distanceM = distanceMeters(gpsLat, gpsLng, outletLat, outletLng);
  return {
    distanceM,
    radiusM,
    status:distanceM <= radiusM ? 'valid' : 'outside',
  };
}

export function assertVisitGeofence(outlet, gps, defaultRadiusM = 50) {
  const evidence = visitGeofenceEvidence(outlet, gps, defaultRadiusM);
  if (evidence.status !== 'valid') {
    throw Object.assign(
      new Error(`Check-in di luar radius outlet (${evidence.distanceM} m dari outlet; batas ${evidence.radiusM} m).`),
      { code:'VISIT_OUTSIDE_GEOFENCE', ...evidence },
    );
  }
  return evidence;
}

function requestDevicePosition(geolocation, options) {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function normalizeGpsError(error) {
  const permissionDenied = Number(error?.code) === 1;
  return Object.assign(
    new Error(permissionDenied
      ? 'Izin lokasi diperlukan untuk check-in.'
      : 'GPS belum mendapatkan lokasi yang valid. Aktifkan Location/Wi-Fi lalu coba lagi.'),
    {
      code:permissionDenied ? 'GPS_PERMISSION_REQUIRED' : 'GPS_POSITION_FAILED',
      causeCode:Number(error?.code) || null,
    },
  );
}

export async function captureDevicePosition(geolocation = (typeof navigator !== 'undefined' ? navigator.geolocation : null)) {
  if (!geolocation?.getCurrentPosition) {
    throw Object.assign(new Error('GPS tidak tersedia di perangkat ini.'), { code:'GPS_UNAVAILABLE' });
  }

  let position;
  try {
    position = await requestDevicePosition(
      geolocation,
      { enableHighAccuracy:true, timeout:10000, maximumAge:30000 },
    );
  } catch (firstError) {
    if (Number(firstError?.code) === 1) throw normalizeGpsError(firstError);
    try {
      // Desktop browsers and some Android devices can fail a high-accuracy fix
      // even though a coarse/cached location is available. Use that as a safe
      // fallback; geofence validation still decides whether the point is usable.
      position = await requestDevicePosition(
        geolocation,
        { enableHighAccuracy:false, timeout:12000, maximumAge:30000 },
      );
    } catch (fallbackError) {
      throw normalizeGpsError(fallbackError);
    }
  }

  const pair = validCoordinatePair(position?.coords?.latitude, position?.coords?.longitude);
  if (!pair) {
    throw Object.assign(new Error('Koordinat GPS tidak valid.'), { code:'GPS_INVALID' });
  }
  const accuracy = Number(position?.coords?.accuracy);
  return {
    ...pair,
    accuracyM:Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    capturedAt:new Date(position?.timestamp || Date.now()).toISOString(),
  };
}
