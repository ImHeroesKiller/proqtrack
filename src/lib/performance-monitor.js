const MAX_SAMPLES = 60;
const LONG_TASK_THRESHOLD_MS = 50;
const samples = [];
let installed = false;
let observer = null;
let controller = null;

function nowIso() {
  return new Date().toISOString();
}

function pushSample(sample) {
  samples.push({ at:nowIso(), ...sample });
  while (samples.length > MAX_SAMPLES) samples.shift();
}

function recordRender(event) {
  const durationMs = Number(event?.detail?.durationMs || 0);
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  pushSample({
    kind:'render',
    route:String(event?.detail?.route || ''),
    durationMs:Math.round(durationMs * 10) / 10,
  });
}

function installLongTaskObserver() {
  if (typeof PerformanceObserver !== 'function') return;
  const supported = PerformanceObserver.supportedEntryTypes || [];
  if (!supported.includes('longtask')) return;
  observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.duration < LONG_TASK_THRESHOLD_MS) continue;
      pushSample({
        kind:'longtask',
        durationMs:Math.round(entry.duration * 10) / 10,
        startTime:Math.round(entry.startTime * 10) / 10,
      });
    }
  });
  try {
    observer.observe({ type:'longtask', buffered:true });
  } catch {
    observer = null;
  }
}

function bootMetric() {
  const boot = window.__PROQTRACK_BOOT__;
  if (!boot?.startedAt || !boot?.readyAt) return null;
  const start = Date.parse(boot.startedAt);
  const end = Date.parse(boot.readyAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0, end - start);
}

function memoryMetric() {
  const memory = performance?.memory;
  if (!memory) return null;
  const used = Number(memory.usedJSHeapSize || 0);
  const limit = Number(memory.jsHeapSizeLimit || 0);
  if (!Number.isFinite(used) || used <= 0) return null;
  return {
    usedJSHeapBytes:used,
    heapLimitBytes:Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

function snapshot() {
  const renders = samples.filter(row => row.kind === 'render');
  const longTasks = samples.filter(row => row.kind === 'longtask');
  const renderDurations = renders.map(row => row.durationMs).sort((a,b) => a-b);
  const percentile = p => {
    if (!renderDurations.length) return null;
    const index = Math.min(renderDurations.length - 1, Math.floor((renderDurations.length - 1) * p));
    return renderDurations[index];
  };
  return {
    installed,
    sampleCount:samples.length,
    bootDurationMs:bootMetric(),
    renderCount:renders.length,
    renderP50Ms:percentile(0.5),
    renderP95Ms:percentile(0.95),
    longTaskCount:longTasks.length,
    longestTaskMs:longTasks.reduce((max,row) => Math.max(max,row.durationMs || 0), 0),
    memory:memoryMetric(),
    recent:samples.slice(-20),
  };
}

export function installPerformanceMonitor() {
  if (installed || typeof window === 'undefined') return false;
  installed = true;
  controller = new AbortController();
  window.addEventListener('proqtrack:render-complete', recordRender, { signal:controller.signal });
  window.addEventListener('pagehide', stopPerformanceMonitor, { once:true, signal:controller.signal });
  installLongTaskObserver();
  return true;
}

export function stopPerformanceMonitor() {
  controller?.abort();
  controller = null;
  observer?.disconnect();
  observer = null;
  installed = false;
}

export function clearPerformanceSamples() {
  samples.length = 0;
}

installPerformanceMonitor();

if (typeof window !== 'undefined') {
  window.ProQPerformance = Object.freeze({
    snapshot,
    clear:clearPerformanceSamples,
    stop:stopPerformanceMonitor,
  });
}
