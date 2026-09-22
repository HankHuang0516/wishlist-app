/**
 * Image URL Validation Test Script
 * Tests both preset URLs and production database images
 * 
 * Usage: npx ts-node src/test_image_validation.ts
 */

import axios from 'axios';
import { validateImageUrl, ImageValidationResult } from './lib/imageValidator';
import { getApiUrl } from './config/constants';

// ========================
// PRESET TEST URLS
// ========================

interface TestCase {
    url: string;
    expected: boolean;
    category: string;
}

const PRESET_TESTS: TestCase[] = [
    // ✅ Valid - Google/Public CDN
    { url: 'https://via.placeholder.com/150', expected: true, category: 'Valid - Placeholder' },
    { url: 'https://picsum.photos/200', expected: true, category: 'Valid - Picsum' },

    // ✅ Valid - E-commerce (may vary by region/IP)
    { url: 'https://cf.shopee.tw/file/tw-11134207-7r98s-ln5nq9y4x7h58f', expected: true, category: 'Valid - Shopee' },
    { url: 'https://img.pchome.com.tw/cs/items/DGBJGSA900H6XWH/i010009_1710398741.jpg', expected: true, category: 'Valid - PChome' },

    // ✅ Valid - Wikipedia Commons
    { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/220px-Camponotus_flavomarginatus_ant.jpg', expected: true, category: 'Valid - Wikipedia' },

    // ✅ Valid - Google User Content
    { url: 'https://lh3.googleusercontent.com/a/default-user=s96-c', expected: true, category: 'Valid - Google' },

    // ❌ Blocked - Facebook CDN (403 for external referers)
    { url: 'https://scontent.ftpe8-1.fna.fbcdn.net/v/t39.30808-6/example.jpg', expected: false, category: 'Blocked - Facebook' },
    { url: 'https://external.ftpe8-1.fna.fbcdn.net/emg1/example.jpg', expected: false, category: 'Blocked - Facebook' },

    // ❌ Blocked - Instagram
    { url: 'https://scontent.cdninstagram.com/v/t51.example.jpg', expected: false, category: 'Blocked - Instagram' },
    { url: 'https://instagram.ftpe8-1.fna.fbcdn.net/v/example.jpg', expected: false, category: 'Blocked - Instagram via FB CDN' },

    // ❌ 404 / Invalid
    { url: 'https://httpstat.us/404', expected: false, category: '404 - Test Server' },
    { url: 'https://example.com/nonexistent-image-12345.jpg', expected: false, category: '404 - Fake Path' },

    // ❌ Not an image
    { url: 'https://www.google.com', expected: false, category: 'Not Image - HTML Page' },
    { url: 'https://jsonplaceholder.typicode.com/todos/1', expected: false, category: 'Not Image - JSON' },

    // ⚠️ Edge cases
    { url: 'https://ui-avatars.com/api/?name=Test+Image&background=random', expected: true, category: 'Valid - UI Avatars' },
];

// ========================
// PRODUCTION DB FETCH
// ========================

const PRODUCTION_API = `${getApiUrl()}/admin/all-images`;

interface DBImage {
    id: number;
    url: string;
    name: string;
}

async function fetchProductionImages(): Promise<DBImage[]> {
    const adminKey = process.env.ADMIN_API_KEY?.trim();
    if (!adminKey) throw new Error('ADMIN_API_KEY must be supplied securely at runtime');
    try {
        const response = await axios.get(PRODUCTION_API, {
            headers: { 'x-admin-key': adminKey }, params: { limit: 100 }, timeout: 15000,
        });
        return response.data.images || [];
    } catch (error: any) {
        throw new Error('Production image lookup failed; credential-bearing request details withheld');
    }
}

// ========================
// MAIN TEST RUNNER
// ========================

async function runTests() {
    console.log('🔍 Image URL Validation Test Suite\n');
    console.log('='.repeat(80));

    // Fetch production images
    console.log('\n📥 Fetching production database images...');
    const dbImages = await fetchProductionImages();
    console.log(`   Found ${dbImages.length} images in production DB.\n`);

    // Combine test cases
    const allTests: TestCase[] = [
        ...PRESET_TESTS,
        ...dbImages.map(img => ({
            url: img.url,
            expected: true, // We expect DB images to be valid (testing reality)
            category: `DB - ${img.name?.substring(0, 20) || 'Unknown'}...`
        }))
    ];

    console.log(`📋 Running ${allTests.length} tests (${PRESET_TESTS.length} preset + ${dbImages.length} DB)...\n`);
    console.log('-'.repeat(80));

    let passed = 0;
    let failed = 0;
    const failures: { url: string; expected: boolean; actual: boolean; category: string; error?: string }[] = [];

    for (const test of allTests) {
        try {
            const result = await validateImageUrl(test.url, 8000); // 8s timeout for slow servers
            const actualValid = result.valid;
            const isPassed = actualValid === test.expected;

            if (isPassed) {
                passed++;
                console.log(`✅ PASS | ${test.category}`);
            } else {
                failed++;
                failures.push({
                    url: test.url,
                    expected: test.expected,
                    actual: actualValid,
                    category: test.category,
                    error: result.error
                });
                console.log(`❌ FAIL | ${test.category}`);
                console.log(`   URL: ${test.url.substring(0, 60)}...`);
                console.log(`   Expected: ${test.expected}, Actual: ${actualValid}`);
                if (result.error) console.log(`   Error: ${result.error}`);
            }
        } catch (error: any) {
            failed++;
            failures.push({
                url: test.url,
                expected: test.expected,
                actual: false,
                category: test.category,
                error: error.message
            });
            console.log(`❌ ERROR | ${test.category}: ${error.message}`);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total: ${allTests.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / allTests.length) * 100).toFixed(1)}%`);

    if (failures.length > 0) {
        console.log('\n❌ FAILURES:');
        failures.forEach((f, i) => {
            console.log(`\n${i + 1}. [${f.category}]`);
            console.log(`   URL: ${f.url}`);
            console.log(`   Expected: ${f.expected}, Got: ${f.actual}`);
            if (f.error) console.log(`   Error: ${f.error}`);
        });
    }

    // Separate report for DB images
    const dbFailures = failures.filter(f => f.category.startsWith('DB -'));
    if (dbFailures.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('⚠️  BROKEN IMAGES IN PRODUCTION DATABASE:', dbFailures.length);
        console.log('='.repeat(80));
        dbFailures.forEach(f => {
            console.log(`- ${f.category}: ${f.url.substring(0, 50)}...`);
        });
    }

    console.log('\n✅ Test suite complete.');
}

// Run
runTests().catch(console.error);
