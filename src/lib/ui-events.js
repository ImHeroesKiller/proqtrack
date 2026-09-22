// CSP-safe delegated UI event bridge.
// Legacy templates use data-pqt-on* attributes instead of executable inline JS.
// This module intentionally supports a small expression grammar and never evals code.

const EVENT_ATTRS = Object.freeze({
  click: 'data-pqt-onclick',
  submit: 'data-pqt-onsubmit',
  change: 'data-pqt-onchange',
  input: 'data-pqt-oninput',
  keydown: 'data-pqt-onkeydown',
});

const CALL_RE = /^(return\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\((.*)\);?$/s;

function decodeQuoted(token) {
  const value = String(token || '').trim();
  const quote = value[0];
  if ((quote !== "'" && quote !== '"') || value[value.length - 1] !== quote) {
    throw new Error('UNSUPPORTED_UI_ARGUMENT');
  }
  let out = '';
  for (let i = 1; i < value.length - 1; i += 1) {
    const char = value[i];
    if (char !== '\\') { out += char; continue; }
    i += 1;
    const next = value[i];
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === 'v') out += '\v';
    else if (next === '0') out += '\0';
    else out += next ?? '';
  }
  return out;
}

export function splitUiStatements(source = '') {
  const text = String(source || '').trim();
  if (!text) return [];
  const statements = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (const char of text) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote) { current += char; escaped = true; continue; }
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') { quote = char; current += char; continue; }
    if (char === '(' || char === '[' || char === '{') { depth += 1; current += char; continue; }
    if (char === ')' || char === ']' || char === '}') { depth -= 1; current += char; continue; }
    if (char === ';' && depth === 0) {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (quote || depth !== 0) throw new Error('UNSUPPORTED_UI_STATEMENTS');
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function splitUiArgs(source = '') {
  const text = String(source || '').trim();
  if (!text) return [];
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (const char of text) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote) { current += char; escaped = true; continue; }
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') { quote = char; current += char; continue; }
    if (char === '(' || char === '[' || char === '{') { depth += 1; current += char; continue; }
    if (char === ')' || char === ']' || char === '}') { depth -= 1; current += char; continue; }
    if (char === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (quote || depth !== 0) throw new Error('UNSUPPORTED_UI_ARGUMENTS');
  args.push(current.trim());
  return args;
}

export function resolveUiArg(token, element, event) {
  const value = String(token || '').trim();
  if (value === 'event') return event;
  if (value === 'this') return element;
  if (value === 'this.value') return element?.value;
  if (value === 'this.checked') return Boolean(element?.checked);
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value.startsWith("'") || value.startsWith('"')) return decodeQuoted(value);
  throw new Error('UNSUPPORTED_UI_ARGUMENT');
}

function resolveCallable(path, root = globalThis) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (parts.length < 2) throw new Error('UNSUPPORTED_UI_CALL');
  let context = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    context = context?.[parts[i]];
    if (!context) throw new Error('UI_TARGET_UNAVAILABLE');
  }
  const fn = context?.[parts.at(-1)];
  if (typeof fn !== 'function') throw new Error('UI_ACTION_UNAVAILABLE');
  return { fn, context };
}

function invokeCall(expression, element, event, root = globalThis) {
  const match = String(expression || '').trim().match(CALL_RE);
  if (!match) throw new Error('UNSUPPORTED_UI_HANDLER');
  const [, returnPrefix, path, argSource] = match;
  const { fn, context } = resolveCallable(path, root);
  const args = splitUiArgs(argSource).map(token => resolveUiArg(token, element, event));
  const result = fn.apply(context, args);
  if (returnPrefix && result === false) event?.preventDefault?.();
  return result;
}

export function dispatchUiHandler(expression, element, event, root = globalThis) {
  const source = String(expression || '').trim();
  if (!source) return undefined;

  const statements = splitUiStatements(source);
  if (statements.length > 1) {
    let result;
    for (const statement of statements) result = dispatchUiHandler(statement, element, event, root);
    return result;
  }

  const overlayClose = source.match(/^if\(event\.target===this\)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\(\))$/);
  if (overlayClose) {
    if (event?.target === element) return invokeCall(overlayClose[1], element, event, root);
    return undefined;
  }

  if (/^if\(event\.key===['"]Enter['"]&&!event\.shiftKey\)\{event\.preventDefault\(\);this\.requestSubmit\(\);\}$/.test(source)) {
    if (event?.key === 'Enter' && !event?.shiftKey) {
      event.preventDefault();
      element?.requestSubmit?.();
    }
    return undefined;
  }

  const valueGuard = source.match(/^if\(this\.value\)(.+)$/s);
  if (valueGuard) {
    if (element?.value) return invokeCall(valueGuard[1], element, event, root);
    return undefined;
  }

  const hashAssignment = source.match(/^location\.hash\s*=\s*(.+);?$/s);
  if (hashAssignment) {
    const target = decodeQuoted(hashAssignment[1].replace(/;$/, '').trim());
    if (root.location) root.location.hash = target;
    return target;
  }

  return invokeCall(source, element, event, root);
}

function eventElements(event, attr) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length) return path.filter(node => node?.getAttribute?.(attr) != null);
  const first = event.target?.closest?.(`[${attr}]`);
  return first ? [first] : [];
}

function handleDelegated(event) {
  const attr = EVENT_ATTRS[event.type];
  if (!attr) return;
  const elements = eventElements(event, attr);
  for (const element of elements) {
    const expression = element.getAttribute(attr);
    if (!expression) continue;
    try {
      dispatchUiHandler(expression, element, event, globalThis);
    } catch (error) {
      console.error('proqtrack_ui_action_failed', {
        type: event.type,
        action: expression.slice(0, 120),
        error: error?.message || String(error),
      });
      globalThis.showToast?.('Aksi tidak dapat dijalankan. Muat ulang halaman lalu coba lagi.', 'error');
    }
    if (event.cancelBubble) break;
  }
}

let installed = false;
export function installUiEvents() {
  if (installed || typeof document === 'undefined') return false;
  installed = true;
  for (const type of Object.keys(EVENT_ATTRS)) document.addEventListener(type, handleDelegated);
  return true;
}

installUiEvents();

if (typeof window !== 'undefined') {
  window.ProQUIEvents = Object.freeze({ dispatchUiHandler, splitUiArgs, splitUiStatements, resolveUiArg });
}
