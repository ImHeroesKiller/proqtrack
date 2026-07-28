/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} brand
 * @property {string} sku
 * @property {string} category
 * @property {string} unit
 * @property {number} price
 * @property {number|null} [cost]
 * @property {number|null} [margin]
 * @property {'active'|'inactive'} status
 */

/**
 * @typedef {Object} Competitor
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} color
 * @property {'active'|'inactive'} status
 * @property {string} [notes]
 */

/**
 * @typedef {Object} CompetitorProduct
 * @property {string} id
 * @property {string} competitorId
 * @property {string} name
 * @property {string} [sku]
 * @property {number} typicalPrice
 * @property {string} unit
 * @property {'active'|'inactive'} status
 */

/**
 * @typedef {Object} PromoType
 * @property {string} code
 * @property {string} label
 * @property {boolean} strategic
 */

/**
 * @typedef {Object} CompetitorIntel
 * @property {string} id
 * @property {string|null} visitId
 * @property {string} outletId
 * @property {string} productId
 * @property {string} competitorProductId
 * @property {number} ourPrice
 * @property {number} competitorPrice
 * @property {number} shelfShare
 * @property {'high'|'medium'|'low'} visibility
 * @property {boolean} hasPromo
 * @property {string} [promoType] code from PromoType
 * @property {string} [promoNotes]
 * @property {string} [notes]
 * @property {string} recordedBy
 * @property {string} recordedAt
 */

/**
 * @typedef {Object} FieldPhoto
 * @property {string} id
 * @property {string|null} visitId
 * @property {string} outletId
 * @property {'location'|'product'|'shelf'|'competitor'} type
 * @property {string} [caption]
 * @property {string|null} [productId]
 * @property {string|null} [competitorId]
 * @property {string|null} [dataUrl]
 * @property {string} recordedBy
 * @property {string} recordedAt
 */

export {};
