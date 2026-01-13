"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const flickr_1 = require("../src/lib/flickr");
function testFlickr() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🧪 Testing Flickr Integration\n');
        console.log('='.repeat(60));
        // Check environment variables
        console.log('\n1. Checking environment variables...');
        const requiredVars = [
            'FLICKR_API_KEY',
            'FLICKR_API_SECRET',
            'FLICKR_OAUTH_TOKEN',
            'FLICKR_OAUTH_TOKEN_SECRET',
            'FLICKR_USER_ID'
        ];
        let allPresent = true;
        for (const varName of requiredVars) {
            const isPresent = !!process.env[varName];
            console.log(`   ${isPresent ? '✅' : '❌'} ${varName}: ${isPresent ? 'Present' : 'Missing'}`);
            if (!isPresent)
                allPresent = false;
        }
        if (!allPresent) {
            console.log('\n❌ Missing required environment variables!');
            console.log('Please set all required variables in your .env file.');
            process.exit(1);
        }
        // Test photoset lookup
        console.log('\n2. Testing photoset lookup...');
        try {
            const photosetId = yield flickr_1.flickrService.getOrCreatePhotoset();
            if (photosetId) {
                console.log(`   ✅ Found existing photoset: ${photosetId}`);
            }
            else {
                console.log(`   ℹ️  No photoset found (will be created on first upload)`);
            }
        }
        catch (error) {
            console.log(`   ❌ Photoset lookup failed: ${error.message}`);
        }
        // Create a test image (1x1 pixel red PNG)
        console.log('\n3. Testing image upload...');
        const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
        try {
            console.log('   Uploading test image...');
            const flickrUrl = yield flickr_1.flickrService.uploadImage(testImageBuffer, 'test_image.png', 'Flickr Integration Test', 'wishlist-app,test');
            if (flickrUrl) {
                console.log(`   ✅ Upload successful!`);
                console.log(`   URL: ${flickrUrl}`);
                console.log('\n   Note: You can delete this test image from your Flickr account.');
            }
            else {
                console.log(`   ❌ Upload failed (no URL returned)`);
            }
        }
        catch (error) {
            console.log(`   ❌ Upload failed: ${error.message}`);
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ Flickr integration test complete!\n');
    });
}
testFlickr().catch(error => {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
});
