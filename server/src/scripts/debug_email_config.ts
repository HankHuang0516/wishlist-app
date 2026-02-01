
import dotenv from 'dotenv';
dotenv.config();

console.log('--- Email Config Debug ---');
console.log('EMAIL_FROM env:', process.env.EMAIL_FROM);
console.log('EMAIL_FROM_NAME env:', process.env.EMAIL_FROM_NAME);

// We need to import the value from emailService, but it's not exported.
// However, we can check what the file *would* resolve to.
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'support@twopiggyhavefun.uk';
console.log('Computed DEFAULT_FROM_EMAIL:', DEFAULT_FROM_EMAIL);

// Read the file content directly
import fs from 'fs';
import path from 'path';

// Try to read the JS file in dist
const distPath = path.join(process.cwd(), 'dist', 'lib', 'emailService.js');
const srcPath = path.join(process.cwd(), 'src', 'lib', 'emailService.ts');

if (fs.existsSync(distPath)) {
    const content = fs.readFileSync(distPath, 'utf-8');
    const match = content.match(/DEFAULT_FROM_EMAIL\s*=\s*(.*?);/);
    console.log('Found in dist/lib/emailService.js:', match ? match[1] : 'Not found');
} else {
    console.log('dist/lib/emailService.js not found');
}
