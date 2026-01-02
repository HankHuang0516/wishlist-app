
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

console.log('--- ENV DEBUG ---');
console.log('CWD:', process.cwd());
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Absolute path of ./dev.db:', path.resolve('./dev.db'));
