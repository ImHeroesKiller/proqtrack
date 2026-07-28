// ProQTrack — Local Database Layer (localStorage-backed)
// Simulates SQLite with full CRUD operations

import { seedEmployees, seedOutlets, seedVisits, seedAttendance, seedAccounts, seedProducts, seedLeaveTypes, seedLeaves, seedStocks, seedPriceObservations } from '../data/seed.js';
import { uid } from './utils.js';

const DB_KEY = 'proqtrack_db_v4';

const DB_VERSION = 4;

function defaultDB() {
  return {
    _version: DB_VERSION,
    employees:  JSON.parse(JSON.stringify(seedEmployees)),
    outlets:    JSON.parse(JSON.stringify(seedOutlets)),
    visits:     JSON.parse(JSON.stringify(seedVisits)),
    attendance: JSON.parse(JSON.stringify(seedAttendance)),
    accounts:   JSON.parse(JSON.stringify(seedAccounts)),
    products:   JSON.parse(JSON.stringify(seedProducts)),
    leaveTypes: JSON.parse(JSON.stringify(seedLeaveTypes)),
    leaves:     JSON.parse(JSON.stringify(seedLeaves)),
    stocks:     JSON.parse(JSON.stringify(seedStocks)),
    priceObservations: JSON.parse(JSON.stringify(seedPriceObservations)),
  };
}

let _cache = null;

export function getDB() {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // migrate old DB versions
      if (!parsed.accounts) parsed.accounts = JSON.parse(JSON.stringify(seedAccounts));
      if (!parsed.products) parsed.products = JSON.parse(JSON.stringify(seedProducts));
      if (!parsed.leaveTypes) parsed.leaveTypes = JSON.parse(JSON.stringify(seedLeaveTypes));
      if (!parsed.leaves) parsed.leaves = JSON.parse(JSON.stringify(seedLeaves));
      if (!parsed.stocks) parsed.stocks = JSON.parse(JSON.stringify(seedStocks));
      if (!parsed.priceObservations) parsed.priceObservations = JSON.parse(JSON.stringify(seedPriceObservations));
      _cache = parsed;
      return _cache;
    }
  } catch (e) {
    console.error('Failed to read DB', e);
  }
  _cache = defaultDB();
  saveDB();
  return _cache;
}

export function saveDB() {
  if (!_cache) return;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(_cache));
  } catch (e) {
    console.error('Failed to save DB', e);
  }
}

export function resetDB() {
  _cache = defaultDB();
  saveDB();
  return _cache;
}

// ========== ACCOUNTS ==========
export function getAccounts() {
  return getDB().accounts;
}

export function authenticate(email, password) {
  const acc = getDB().accounts.find(a => a.email.toLowerCase() === email.toLowerCase().trim());
  if (!acc || acc.password !== password) return null;
  return acc;
}

// ========== EMPLOYEES ==========
export function getEmployees() {
  return getDB().employees;
}

export function getEmployee(id) {
  return getDB().employees.find(e => e.id === id);
}

export function createEmployee(data) {
  const emp = { id: uid('EMP'), totalVisits: 0, todayVisits: 0, status: 'active', ...data };
  getDB().employees.push(emp);
  saveDB();
  return emp;
}

export function updateEmployee(id, data) {
  const db = getDB();
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return null;
  db.employees[idx] = { ...db.employees[idx], ...data };
  saveDB();
  return db.employees[idx];
}

export function deleteEmployee(id) {
  const db = getDB();
  db.employees = db.employees.filter(e => e.id !== id);
  saveDB();
}

// ========== OUTLETS ==========
export function getOutlets() {
  return getDB().outlets;
}

export function getOutlet(id) {
  return getDB().outlets.find(o => o.id === id);
}

export function createOutlet(data) {
  const outlet = { id: uid('OUT'), status: 'active', ...data };
  getDB().outlets.push(outlet);
  saveDB();
  return outlet;
}

export function updateOutlet(id, data) {
  const db = getDB();
  const idx = db.outlets.findIndex(o => o.id === id);
  if (idx === -1) return null;
  db.outlets[idx] = { ...db.outlets[idx], ...data };
  saveDB();
  return db.outlets[idx];
}

export function deleteOutlet(id) {
  const db = getDB();
  db.outlets = db.outlets.filter(o => o.id !== id);
  saveDB();
}

// ========== VISITS ==========
export function getVisits() {
  return getDB().visits;
}

export function getVisitsByEmployee(empId) {
  return getDB().visits.filter(v => v.employeeId === empId);
}

export function getVisitsByOutlet(outletId) {
  return getDB().visits.filter(v => v.outletId === outletId);
}

export function getVisitsByDate(date) {
  return getDB().visits.filter(v => v.date === date);
}

export function createVisit(data) {
  const visit = { id: uid('VIS'), rating: 0, notes: '', checkInTime: null, checkOutTime: null, status: 'planned', ...data };
  getDB().visits.push(visit);
  saveDB();
  return visit;
}

export function updateVisit(id, data) {
  const db = getDB();
  const idx = db.visits.findIndex(v => v.id === id);
  if (idx === -1) return null;
  db.visits[idx] = { ...db.visits[idx], ...data };
  saveDB();
  return db.visits[idx];
}

export function deleteVisit(id) {
  const db = getDB();
  db.visits = db.visits.filter(v => v.id !== id);
  saveDB();
}

// ========== ATTENDANCE ==========
export function getAttendance() {
  return getDB().attendance;
}

export function getAttendanceByDate(date) {
  return getDB().attendance.filter(a => a.date === date);
}

export function getAttendanceByEmployee(empId) {
  return getDB().attendance.filter(a => a.employeeId === empId);
}

export function createAttendance(data) {
  const att = { id: uid('ATT'), ...data };
  getDB().attendance.push(att);
  saveDB();
  return att;
}

export function updateAttendance(id, data) {
  const db = getDB();
  const idx = db.attendance.findIndex(a => a.id === id);
  if (idx === -1) return null;
  db.attendance[idx] = { ...db.attendance[idx], ...data };
  saveDB();
  return db.attendance[idx];
}

// ========== ANALYTICS ==========
export function getDashboardStats() {
  const db = getDB();
  const today = '2024-07-27';
  const todayVisits = db.visits.filter(v => v.date === today);
  const completedVisits = todayVisits.filter(v => v.status === 'completed');
  const activeVisits = todayVisits.filter(v => v.status === 'checked-in');
  const plannedVisits = todayVisits.filter(v => v.status === 'planned');
  const activeEmployees = db.employees.filter(e => e.status === 'active');
  const todayAttendance = db.attendance.filter(a => a.date === today);
  const hadir = todayAttendance.filter(a => a.status === 'hadir');
  const terlambat = todayAttendance.filter(a => a.status === 'terlambat');
  const tidakHadir = todayAttendance.filter(a => a.status === 'tidak hadir');

  return {
    totalEmployees: db.employees.length,
    activeEmployees: activeEmployees.length,
    totalOutlets: db.outlets.length,
    activeOutlets: db.outlets.filter(o => o.status === 'active').length,
    todayVisits: todayVisits.length,
    completedVisits: completedVisits.length,
    activeVisits: activeVisits.length,
    plannedVisits: plannedVisits.length,
    totalVisits: db.visits.length,
    attendanceHadir: hadir.length,
    attendanceTerlambat: terlambat.length,
    attendanceTidakHadir: tidakHadir.length,
    avgRating: (() => {
      const rated = todayVisits.filter(v => v.rating > 0);
      if (rated.length === 0) return 0;
      return (rated.reduce((s, v) => s + v.rating, 0) / rated.length).toFixed(1);
    })(),
    totalProducts: db.products.length,
    activeProducts: db.products.filter(p => p.status === 'active').length,
    totalStocks: db.stocks.length,
    lowStocks: db.stocks.filter(s => s.quantity <= s.minStock).length,
    pendingLeaves: db.leaves.filter(l => l.status === 'pending').length,
    approvedLeaves: db.leaves.filter(l => l.status === 'approved').length,
    rejectedLeaves: db.leaves.filter(l => l.status === 'rejected').length,
  };
}

// ========== PRODUCTS ==========
export function getProducts() {
  return getDB().products;
}

export function getProduct(id) {
  return getDB().products.find(p => p.id === id);
}

export function createProduct(data) {
  const product = { id: uid('PRD'), status: 'active', ...data };
  getDB().products.push(product);
  saveDB();
  return product;
}

export function updateProduct(id, data) {
  const db = getDB();
  const idx = db.products.findIndex(p => p.id === id);
  if (idx === -1) return null;
  db.products[idx] = { ...db.products[idx], ...data };
  saveDB();
  return db.products[idx];
}

export function deleteProduct(id) {
  const db = getDB();
  db.products = db.products.filter(p => p.id !== id);
  saveDB();
}

// ========== LEAVES (Ijin & Cuti) ==========
export function getLeaves() {
  return getDB().leaves;
}

export function getLeavesByEmployee(empId) {
  return getDB().leaves.filter(l => l.employeeId === empId);
}

export function getLeaveTypes() {
  return getDB().leaveTypes;
}

export function createLeave(data) {
  const leave = { id: uid('LV'), status: 'pending', submittedAt: new Date().toISOString().slice(0,10), approverId: null, approvedAt: null, ...data };
  getDB().leaves.push(leave);
  saveDB();
  return leave;
}

export function updateLeave(id, data) {
  const db = getDB();
  const idx = db.leaves.findIndex(l => l.id === id);
  if (idx === -1) return null;
  db.leaves[idx] = { ...db.leaves[idx], ...data };
  saveDB();
  return db.leaves[idx];
}

export function deleteLeave(id) {
  const db = getDB();
  db.leaves = db.leaves.filter(l => l.id !== id);
  saveDB();
}

// ========== STOCKS ==========
export function getStocks() {
  return getDB().stocks;
}

export function getStocksByOutlet(outletId) {
  return getDB().stocks.filter(s => s.outletId === outletId);
}

export function getStocksByProduct(productId) {
  return getDB().stocks.filter(s => s.productId === productId);
}

export function createStock(data) {
  const stock = { id: uid('STK'), lastUpdated: new Date().toISOString().slice(0,10), ...data };
  getDB().stocks.push(stock);
  saveDB();
  return stock;
}

export function updateStock(id, data) {
  const db = getDB();
  const idx = db.stocks.findIndex(s => s.id === id);
  if (idx === -1) return null;
  db.stocks[idx] = { ...db.stocks[idx], ...data, lastUpdated: new Date().toISOString().slice(0,10) };
  saveDB();
  return db.stocks[idx];
}

export function deleteStock(id) {
  const db = getDB();
  db.stocks = db.stocks.filter(s => s.id !== id);
  saveDB();
}

// ========== PRICE OBSERVATIONS (Harga & Diskon Lapangan) ==========
export function getPriceObservations() {
  return getDB().priceObservations || [];
}

export function getPriceObservationsByOutlet(outletId) {
  return getPriceObservations().filter(p => p.outletId === outletId);
}

export function getPriceObservationsByVisit(visitId) {
  return getPriceObservations().filter(p => p.visitId === visitId);
}

export function getPriceObservationsByEmployee(empId) {
  return getPriceObservations().filter(p => p.recordedBy === empId);
}

export function createPriceObservation(data) {
  const obs = {
    id: uid('PRC'),
    observedPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    notes: '',
    recordedAt: new Date().toISOString().slice(0,10),
    ...data
  };
  getDB().priceObservations.push(obs);
  saveDB();
  return obs;
}

export function updatePriceObservation(id, data) {
  const db = getDB();
  const idx = db.priceObservations.findIndex(p => p.id === id);
  if (idx === -1) return null;
  db.priceObservations[idx] = { ...db.priceObservations[idx], ...data };
  saveDB();
  return db.priceObservations[idx];
}

export function deletePriceObservation(id) {
  const db = getDB();
  db.priceObservations = db.priceObservations.filter(p => p.id !== id);
  saveDB();
}

// Helper: get outlets visited by an employee
export function getVisitedOutletIds(empId) {
  const visits = getDB().visits.filter(v => v.employeeId === empId);
  return [...new Set(visits.map(v => v.outletId))];
}

