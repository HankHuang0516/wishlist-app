import 'dotenv/config';

/**
 * Diagnostic script to check Flickr environment variables
 * This helps identify which variables are missing or misconfigured
 */

console.log('🔍 Flickr Environment Variables Diagnostic\n');
console.log('='.repeat(60));

const requiredVars = [
    'FLICKR_API_KEY',
    'FLICKR_API_SECRET',
    'FLICKR_OAUTH_TOKEN',
    'FLICKR_OAUTH_TOKEN_SECRET'
];

const optionalVars = [
    'FLICKR_USER_ID'
];

let allPresent = true;

console.log('\n📋 Required Variables:');
for (const varName of requiredVars) {
    const value = process.env[varName];
    const status = value ? '✅ SET' : '❌ MISSING';
    const preview = value ? `${value.substring(0, 10)}...` : 'N/A';

    console.log(`   ${status} ${varName}: ${preview}`);

    if (!value) {
        allPresent = false;
        console.log(`      ⚠️  This variable is REQUIRED for Flickr upload`);
    }
}

console.log('\n📋 Optional Variables:');
for (const varName of optionalVars) {
    const value = process.env[varName];
    const status = value ? '✅ SET' : '⚠️  NOT SET';
    const preview = value || 'N/A';

    console.log(`   ${status} ${varName}: ${preview}`);
}

console.log('\n' + '='.repeat(60));

if (!allPresent) {
    console.log('❌ DIAGNOSIS: Missing required environment variables!');
    console.log('\n📝 ACTION REQUIRED:');
    console.log('1. Go to Railway Dashboard');
    console.log('2. Select your project');
    console.log('3. Go to Variables tab');
    console.log('4. Add the missing variables');
    console.log('5. Redeploy the application');
    console.log('\n💡 Variable values should match your .env file:');
    console.log('   FLICKR_API_KEY=63e5e74b99b60fd251c0f4ffdbd669c5');
    console.log('   FLICKR_API_SECRET=c838d03f399b981a');
    console.log('   FLICKR_OAUTH_TOKEN=72157720962182558-a6674a4444cb4702');
    console.log('   FLICKR_OAUTH_TOKEN_SECRET=b21a63ca1b2e3075');
    console.log('   FLICKR_USER_ID=158881690@N04');
} else {
    console.log('✅ DIAGNOSIS: All required environment variables are present!');
    console.log('\n📝 Next steps:');
    console.log('1. Check Railway logs for actual error messages');
    console.log('2. Look for "[Flickr]" in the logs');
    console.log('3. If you see "Upload failed", check the error details');
}

console.log('\n');
