"use strict";
/**
 * Image URL Validation Test Script
 * Tests both preset URLs and production database images
 *
 * Usage: npx ts-node src/test_image_validation.ts
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const imageValidator_1 = require("./lib/imageValidator");
const PRESET_TESTS = [
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
const PRODUCTION_API = 'https://wishlist-app-production.up.railway.app/api/admin/all-images';
const ADMIN_KEY = 'wishlist-secure-admin-2026-xK9p';
function fetchProductionImages() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`${PRODUCTION_API}?key=${ADMIN_KEY}&limit=100`);
            return response.data.images || [];
        }
        catch (error) {
            console.error('❌ Failed to fetch production images:', error.message);
            return [];
        }
    });
}
// ========================
// MAIN TEST RUNNER
// ========================
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Image URL Validation Test Suite\n');
        console.log('='.repeat(80));
        // Fetch production images
        console.log('\n📥 Fetching production database images...');
        const dbImages = yield fetchProductionImages();
        console.log(`   Found ${dbImages.length} images in production DB.\n`);
        // Combine test cases
        const allTests = [
            ...PRESET_TESTS,
            ...dbImages.map(img => {
                var _a;
                return ({
                    url: img.url,
                    expected: true, // We expect DB images to be valid (testing reality)
                    category: `DB - ${((_a = img.name) === null || _a === void 0 ? void 0 : _a.substring(0, 20)) || 'Unknown'}...`
                });
            })
        ];
        console.log(`📋 Running ${allTests.length} tests (${PRESET_TESTS.length} preset + ${dbImages.length} DB)...\n`);
        console.log('-'.repeat(80));
        let passed = 0;
        let failed = 0;
        const failures = [];
        for (const test of allTests) {
            try {
                const result = yield (0, imageValidator_1.validateImageUrl)(test.url, 8000); // 8s timeout for slow servers
                const actualValid = result.valid;
                const isPassed = actualValid === test.expected;
                if (isPassed) {
                    passed++;
                    console.log(`✅ PASS | ${test.category}`);
                }
                else {
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
                    if (result.error)
                        console.log(`   Error: ${result.error}`);
                }
            }
            catch (error) {
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
                if (f.error)
                    console.log(`   Error: ${f.error}`);
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
    });
}
// Run
runTests().catch(console.error);
