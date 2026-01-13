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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const flickr_1 = require("../src/lib/flickr");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
/**
 * Download image from URL or read from local file
 */
function downloadImage(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Check if it's a local file path
            if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
                const localPath = path_1.default.join(process.cwd(), url.startsWith('/') ? url.slice(1) : url);
                if (fs_1.default.existsSync(localPath)) {
                    return fs_1.default.readFileSync(localPath);
                }
                else {
                    console.error(`Local file not found: ${localPath}`);
                    return null;
                }
            }
            // Download from URL
            const response = yield axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            return Buffer.from(response.data);
        }
        catch (error) {
            console.error(`Failed to download image from ${url}:`, error.message);
            return null;
        }
    });
}
/**
 * Check if URL is a Flickr URL (already migrated)
 */
function isFlickrUrl(url) {
    return url.includes('flickr.com') || url.includes('staticflickr.com');
}
/**
 * Migrate all existing item images to Flickr
 */
function migrateImagesToFlickr() {
    return __awaiter(this, arguments, void 0, function* (dryRun = false) {
        console.log('='.repeat(60));
        console.log('🚀 Flickr Image Migration Script');
        console.log('='.repeat(60));
        console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE MIGRATION'}`);
        console.log('');
        const stats = {
            total: 0,
            migrated: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };
        try {
            // Get all items with images
            const items = yield prisma.item.findMany({
                where: {
                    imageUrl: {
                        not: null
                    }
                },
                select: {
                    id: true,
                    name: true,
                    imageUrl: true
                }
            });
            stats.total = items.length;
            console.log(`📊 Found ${stats.total} items with images\n`);
            for (const item of items) {
                const imageUrl = item.imageUrl;
                console.log(`\n[${stats.migrated + stats.skipped + stats.failed + 1}/${stats.total}] Processing Item #${item.id}: ${item.name || 'Untitled'}`);
                console.log(`  Current URL: ${imageUrl.substring(0, 80)}${imageUrl.length > 80 ? '...' : ''}`);
                // Skip if already on Flickr
                if (isFlickrUrl(imageUrl)) {
                    console.log(`  ⏭️  Already on Flickr - skipping`);
                    stats.skipped++;
                    continue;
                }
                // Skip if dry run
                if (dryRun) {
                    console.log(`  🔍 [DRY RUN] Would migrate this image`);
                    stats.skipped++;
                    continue;
                }
                try {
                    // Download image
                    console.log(`  📥 Downloading image...`);
                    const imageBuffer = yield downloadImage(imageUrl);
                    if (!imageBuffer) {
                        throw new Error('Failed to download image');
                    }
                    // Upload to Flickr
                    console.log(`  ☁️  Uploading to Flickr...`);
                    const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, `item_${item.id}_migrated.jpg`, `${item.name || 'Item ' + item.id} (Migrated)`, 'wishlist-app,migrated');
                    if (!flickrUrl) {
                        throw new Error('Failed to upload to Flickr');
                    }
                    // Update database
                    console.log(`  💾 Updating database...`);
                    yield prisma.item.update({
                        where: { id: item.id },
                        data: { imageUrl: flickrUrl }
                    });
                    console.log(`  ✅ Migrated successfully!`);
                    console.log(`  New URL: ${flickrUrl.substring(0, 80)}${flickrUrl.length > 80 ? '...' : ''}`);
                    stats.migrated++;
                    // Rate limit: wait 1 second between uploads
                    yield new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch (error) {
                    console.error(`  ❌ Migration failed:`, error.message);
                    stats.failed++;
                    stats.errors.push({
                        itemId: item.id,
                        error: error.message
                    });
                }
            }
            // Print summary
            console.log('\n' + '='.repeat(60));
            console.log('📊 Migration Summary');
            console.log('='.repeat(60));
            console.log(`Total items:        ${stats.total}`);
            console.log(`✅ Migrated:        ${stats.migrated}`);
            console.log(`⏭️  Skipped:         ${stats.skipped}`);
            console.log(`❌ Failed:          ${stats.failed}`);
            console.log('');
            if (stats.errors.length > 0) {
                console.log('Failed items:');
                stats.errors.forEach(err => {
                    console.log(`  - Item #${err.itemId}: ${err.error}`);
                });
                console.log('');
            }
            if (dryRun) {
                console.log('🔍 This was a DRY RUN - no changes were made');
                console.log('Run without --dry-run flag to perform actual migration');
            }
            else {
                console.log('✅ Migration complete!');
            }
        }
        catch (error) {
            console.error('\n❌ Fatal error during migration:', error.message);
            process.exit(1);
        }
        finally {
            yield prisma.$disconnect();
        }
    });
}
// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const help = args.includes('--help') || args.includes('-h');
if (help) {
    console.log(`
Flickr Image Migration Script

Usage:
  npx ts-node scripts/migrate_images_to_flickr.ts [options]

Options:
  --dry-run, -d    Run in dry-run mode (no changes made)
  --help, -h       Show this help message

Examples:
  # Preview what would be migrated
  npx ts-node scripts/migrate_images_to_flickr.ts --dry-run

  # Actually migrate images
  npx ts-node scripts/migrate_images_to_flickr.ts
`);
    process.exit(0);
}
// Run migration
migrateImagesToFlickr(dryRun);
