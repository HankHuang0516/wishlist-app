
const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
    'wishlist-app-production.up.railway.app',
    'https://wishlist-app-production',
    'C:\\Users',
    '/tmp/' // Warning only, usually
];

// Files to exclude from checking (e.g., config files, tests, this script)
const EXCLUSIONS = [
    'server/src/config/constants.ts', // The source of truth
    'client/src/config.ts',           // Client config
    'scripts/verify_no_hardcoded.js', // This script
    'scripts/check_hardcoded.js',     // Alias
    'package-lock.json',
    'yarn.lock',
    '.git',
    'node_modules',
    'dist',
    'build',
    '.agent', // Agent artifacts
    'verification_result.txt',
    'HARDCODED_VALUES_REFACTOR.md',
    'server/src/scripts', // Allow test scripts to have hardcoded values for now? Or strict? Let's be strict but maybe allow specific files if needed.
    'test_image_validation.ts' // This seems to be a test file in src root
];

// Whitelist specific false positives if needed
const WHITELIST = [
    // 'some/file.ts:allowed-line-content'
];

function scanDirectory(dir) {
    let files = fs.readdirSync(dir);
    let errorCount = 0;

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

        // Check exclusions
        if (EXCLUSIONS.some(ex => relativePath.includes(ex))) {
            continue;
        }

        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            errorCount += scanDirectory(fullPath);
        } else {
            // Only scan source files
            if (!/\.(ts|tsx|js|jsx|json)$/.test(file)) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                FORBIDDEN_PATTERNS.forEach(pattern => {
                    if (line.includes(pattern)) {
                        // Check if line is whitelisted (not implemented strictly here, simple check)
                        console.error(`❌ Potential Hardcoded Value in ${relativePath}:${index + 1}`);
                        console.error(`   Header: "${pattern}"`);
                        console.error(`   Line: ${line.trim()}`);
                        errorCount++;
                    }
                });
            });
        }
    }
    return errorCount;
}

console.log('🔍 Scanning for hardcoded values...');
const clientErrors = scanDirectory(path.join(process.cwd(), 'client/src'));
const serverErrors = scanDirectory(path.join(process.cwd(), 'server/src'));

const totalErrors = clientErrors + serverErrors;

if (totalErrors > 0) {
    console.error(`\nFound ${totalErrors} potential hardcoded values.`);
    process.exit(1);
} else {
    console.log('\n✅ No forbidden hardcoded patterns found!');
    process.exit(0);
}
