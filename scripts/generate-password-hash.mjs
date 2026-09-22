import { hashPassword, PASSWORD_KDF_ITERATIONS } from '../worker/index.js';

const password = String(process.env.PROQTRACK_BOOTSTRAP_PASSWORD || '');
if (password.length < 12) {
  console.error('Set PROQTRACK_BOOTSTRAP_PASSWORD to at least 12 characters.');
  process.exit(1);
}
const hash = await hashPassword(password);
console.log(hash);
console.error(`Generated PBKDF2-SHA256 hash with ${PASSWORD_KDF_ITERATIONS} iterations. The plaintext password was not printed.`);
