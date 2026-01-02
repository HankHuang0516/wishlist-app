#!/usr/bin/env node
/**
 * Pre-Release Regression Test Runner
 * Comprehensive test suite to run before deployment
 * 
 * Usage:
 *   node scripts/regression-test.js [--skip-build] [--quick]
 * 
 * Options:
 *   --skip-build  Skip the build verification step
 *   --quick       Run only essential tests
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const quickMode = args.includes('--quick');

const rootDir = path.resolve(__dirname, '..');
const clientDir = path.join(rootDir, 'client');
const serverDir = path.join(rootDir, 'server');

// Results tracking
const results = {
    steps: [],
    startTime: Date.now()
};

function log(icon, msg, color = colors.reset) {
    console.log(`${color}${icon}${colors.reset} ${msg}`);
}

function section(title) {
    console.log(`\n${colors.bold}${colors.cyan}▶ ${title}${colors.reset}`);
    console.log('─'.repeat(50));
}

function execute(command, cwd, description) {
    log('⏳', description, colors.yellow);
    try {
        execSync(command, {
            cwd,
            stdio: 'inherit',
            timeout: 300000 // 5 minutes timeout
        });
        log('✓', `${description} - PASSED`, colors.green);
        results.steps.push({ step: description, status: 'passed' });
        return true;
    } catch (error) {
        log('✗', `${description} - FAILED`, colors.red);
        results.steps.push({ step: description, status: 'failed', error: error.message });
        return false;
    }
}

function executeWithOutput(command, cwd, description) {
    log('⏳', description, colors.yellow);
    try {
        const output = execSync(command, {
            cwd,
            encoding: 'utf8',
            timeout: 300000
        });
        log('✓', `${description} - PASSED`, colors.green);
        results.steps.push({ step: description, status: 'passed' });
        return output;
    } catch (error) {
        log('✗', `${description} - FAILED`, colors.red);
        results.steps.push({ step: description, status: 'failed', error: error.message });
        return null;
    }
}

async function main() {
    console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════╗`);
    console.log(`║       Wishlist.ai Regression Test Suite          ║`);
    console.log(`╚══════════════════════════════════════════════════╝${colors.reset}`);
    console.log(`Mode: ${quickMode ? 'Quick' : 'Full'} | Skip Build: ${skipBuild}`);
    console.log(`Started: ${new Date().toISOString()}`);

    let allPassed = true;

    // Step 1: Dependency Check
    section('1. Environment Verification');
    const nodeVersion = executeWithOutput('node --version', rootDir, 'Check Node.js version');
    if (nodeVersion) {
        console.log(`   Node.js: ${nodeVersion.trim()}`);
    } else {
        allPassed = false;
    }

    // Step 2: Install Dependencies (skip if quick mode)
    if (!quickMode) {
        section('2. Dependencies');
        if (!execute('npm install', clientDir, 'Install client dependencies')) {
            allPassed = false;
        }
    }

    // Step 3: TypeScript Compilation
    if (!skipBuild) {
        section('3. Build Verification');
        if (!execute('npm run build', clientDir, 'Build client (TypeScript + Vite)')) {
            allPassed = false;
        }
    }

    // Step 4: Unit Tests
    section('4. Unit Tests');
    if (!execute('npm run test -- --run', clientDir, 'Run Vitest unit tests')) {
        allPassed = false;
    }

    // Step 5: Smoke Tests (only if not quick mode)
    if (!quickMode) {
        section('5. Smoke Tests');
        console.log('   (Requires running server - skipping in offline mode)');
        results.steps.push({ step: 'Smoke tests', status: 'skipped', note: 'Requires running server' });
    }

    // Step 6: Generate Report
    section('6. Test Report');

    const passed = results.steps.filter(s => s.status === 'passed').length;
    const failed = results.steps.filter(s => s.status === 'failed').length;
    const skipped = results.steps.filter(s => s.status === 'skipped').length;
    const duration = ((Date.now() - results.startTime) / 1000).toFixed(1);

    console.log(`\n┌─────────────────────────────────────────┐`);
    console.log(`│ ${colors.bold}TEST RESULTS${colors.reset}                            │`);
    console.log(`├─────────────────────────────────────────┤`);
    console.log(`│ Passed:  ${colors.green}${passed.toString().padEnd(3)}${colors.reset}                           │`);
    console.log(`│ Failed:  ${colors.red}${failed.toString().padEnd(3)}${colors.reset}                           │`);
    console.log(`│ Skipped: ${colors.yellow}${skipped.toString().padEnd(3)}${colors.reset}                           │`);
    console.log(`│ Duration: ${duration}s                         │`);
    console.log(`└─────────────────────────────────────────┘`);

    if (failed > 0) {
        console.log(`\n${colors.red}${colors.bold}❌ REGRESSION TEST FAILED${colors.reset}`);
        console.log(`${colors.red}Do NOT deploy until all tests pass.${colors.reset}`);

        console.log(`\n${colors.bold}Failed Steps:${colors.reset}`);
        results.steps.filter(s => s.status === 'failed').forEach(s => {
            console.log(`  - ${s.step}`);
        });

        process.exit(1);
    } else {
        console.log(`\n${colors.green}${colors.bold}✅ REGRESSION TEST PASSED${colors.reset}`);
        console.log(`${colors.green}Ready to deploy!${colors.reset}`);
        process.exit(0);
    }
}

main().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});
