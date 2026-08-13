import { sanitizePlainText } from './utils.js';

const FEMALE_NAMES = /\b(siti|dewi|maya|nadia|putri|ayu|ratna|rina|fitri|dian|sri|nur|nina|lina|maharani|lestari|permata|hana|intan|laras|salsa|vina|anisa|bella|citra|eka)\b/i;
const MALE_SHIRTS = ['#ea580c', '#2563eb', '#0f766e', '#7c3aed', '#0891b2', '#334155', '#c2410c', '#1d4ed8'];
const FEMALE_SHIRTS = ['#db2777', '#7c3aed', '#ea580c', '#0f766e', '#d97706', '#2563eb', '#be185d', '#4f46e5'];
const SKIN = ['#F4C7A1', '#DDA77B', '#C9875C', '#A96845'];

function hashId(value) {
  return String(value || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function isFemaleName(employee) {
  return String(employee?.gender || '').toLowerCase() === 'female'
    || FEMALE_NAMES.test(String(employee?.name || '').toLowerCase());
}

export function defaultPortrait(employee = {}, index = 0) {
  const name = sanitizePlainText(employee.name || 'User') || 'User';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  const female = isFemaleName(employee);
  const palette = female ? FEMALE_SHIRTS : MALE_SHIRTS;
  const seed = hashId(employee.id || employee.email || name) + index;
  const shirt = palette[seed % palette.length];
  const skin = SKIN[seed % SKIN.length];
  const hair = female ? '#3f2a1d' : '#263238';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#f1f5f9"/><circle cx="80" cy="63" r="34" fill="${skin}"/><path d="${female ? 'M38 70c8-36 76-40 84 0-18-14-64-14-84 0Z' : 'M45 62c3-31 67-42 72 1-15-17-55-18-72-1Z'}" fill="${hair}"/><path d="M28 160c3-41 24-61 52-61s50 20 52 61Z" fill="${shirt}"/><circle cx="68" cy="64" r="3" fill="#263238"/><circle cx="92" cy="64" r="3" fill="#263238"/><path d="M70 81c7 6 14 6 21 0" fill="none" stroke="#8d4f3a" stroke-width="3" stroke-linecap="round"/><circle cx="126" cy="128" r="24" fill="#fff" opacity=".94"/><text x="126" y="135" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="${shirt}">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
