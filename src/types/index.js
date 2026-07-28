// ProQTrack — TypeScript-style type definitions (JSDoc)

/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} phone
 * @property {string} role - 'Field Sales' | 'Supervisor' | 'Admin'
 * @property {string} area
 * @property {string} status - 'active' | 'inactive'
 * @property {number} lat
 * @property {number} lng
 * @property {string} joinDate
 * @property {number} todayVisits
 * @property {number} targetVisits
 * @property {number} totalVisits
 */

/**
 * @typedef {Object} Outlet
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {string} type - 'Toko Kelontong' | 'Minimarket' | 'Restoran' | etc
 * @property {number} lat
 * @property {number} lng
 * @property {string} owner
 * @property {string} phone
 * @property {string} area
 * @property {string} visitFrequency - 'Mingguan' | 'Bulanan'
 * @property {string} status - 'active' | 'inactive'
 */

/**
 * @typedef {Object} Visit
 * @property {string} id
 * @property {string} employeeId
 * @property {string} outletId
 * @property {string} date - 'YYYY-MM-DD'
 * @property {string|null} checkInTime - 'HH:MM'
 * @property {string|null} checkOutTime - 'HH:MM'
 * @property {string} status - 'planned' | 'checked-in' | 'completed'
 * @property {string} notes
 * @property {number} rating - 0-5
 */

/**
 * @typedef {Object} Attendance
 * @property {string} id
 * @property {string} employeeId
 * @property {string} date - 'YYYY-MM-DD'
 * @property {string|null} checkInTime - 'HH:MM'
 * @property {string|null} checkInLocation
 * @property {string} status - 'hadir' | 'terlambat' | 'tidak hadir'
 */
