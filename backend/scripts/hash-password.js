// Usage: npm run hash-password -- "your-strong-password"
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-strong-password"');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
console.log(`\nADMIN_PASSWORD_HASH=${hash}\n`);
console.log('Paste this into backend/.env. If you use docker/compose or shell export, wrap it in single quotes (the hash contains $).');
