"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getPublicItems = exports.getItem = exports.watchItem = exports.cloneItem = exports.createItemFromUrl = exports.updateItem = exports.deleteItem = exports.createItem = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const aiController_1 = require("./aiController");
const fs_1 = __importDefault(require("fs"));
const cheerio = __importStar(require("cheerio"));
const path_1 = __importDefault(require("path"));
const flickr_1 = require("../lib/flickr");
const usageService_1 = require("../lib/usageService");
// User-Agent Pool for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];
const getRandomHeaders = () => {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    return {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
};
// Async AI Processor
const processItemAi = (itemId, imagePathOrUrl, originalName, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`[AsyncAI] Starting analysis for Item ${itemId}`);
        // Check AI quota
        const canUseAi = yield (0, usageService_1.checkAndIncrementAiUsage)(userId);
        if (!canUseAi) {
            console.log(`[AsyncAI] User ${userId} exceeded AI limit - using Traditional Mode`);
            yield prisma_1.default.item.update({
                where: { id: itemId },
                data: {
                    name: originalName.replace(/\.[^/.]+$/, '') || 'Image Item',
                    notes: '每日 AI 辨識額度已用完，請手動編輯商品資訊。',
                    aiStatus: 'SKIPPED',
                    aiError: 'Daily AI limit exceeded'
                }
            });
            return;
        }
        let imageBuffer;
        // Check if it's a URL or local file path
        if (imagePathOrUrl.startsWith('http')) {
            // Download from URL (Flickr URL)
            console.log(`[AsyncAI] Downloading image from URL: ${imagePathOrUrl}`);
            const response = yield fetch(imagePathOrUrl);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.statusText}`);
            }
            const arrayBuffer = yield response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
        }
        else {
            // Read from local file path
            imageBuffer = fs_1.default.readFileSync(imagePathOrUrl);
        }
        const fileForAi = {
            buffer: imageBuffer,
            mimetype: 'image/jpeg', // simplified, or detect from path
            originalname: originalName
        };
        const aiResult = yield (0, aiController_1.analyzeLocalImage)(fileForAi); // We need to export this from aiController
        // Update Item with results
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: {
                name: aiResult.name,
                price: aiResult.price ? String(aiResult.price) : undefined,
                currency: aiResult.currency,
                aiLink: aiResult.shoppingLink, // Save to aiLink, not link (user link)
                notes: aiResult.description,
                // tags: aiResult.tags
                aiStatus: 'COMPLETED',
                aiError: null
            }
        });
        // No need to upload to Flickr again if it's already a Flickr URL
        if (!imagePathOrUrl.startsWith('http')) {
            // Only upload to Flickr if we used a local file path
            try {
                const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, `item_${itemId}_${Date.now()}.jpg`, `Item ${itemId} - ${aiResult.name || originalName}`);
                if (flickrUrl) {
                    console.log(`[AsyncAI] Migrated Item ${itemId} to Flickr: ${flickrUrl}`);
                    yield prisma_1.default.item.update({
                        where: { id: itemId },
                        data: { imageUrl: flickrUrl }
                    });
                    // Clean up local file after successful Flickr upload
                    try {
                        fs_1.default.unlinkSync(imagePathOrUrl);
                    }
                    catch (e) {
                        console.warn(`[AsyncAI] Failed to delete temp file:`, e);
                    }
                }
            }
            catch (flickrErr) {
                console.error(`[AsyncAI] Flickr upload failed for Item ${itemId}`, flickrErr);
                // Continue, don't fail the whole process
            }
        }
        console.log(`[AsyncAI] Completed Item ${itemId}`);
    }
    catch (error) {
        console.error(`[AsyncAI] Failed for Item ${itemId}:`, error);
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: {
                aiStatus: 'FAILED',
                aiError: error.message || 'Unknown error'
            }
        });
    }
});
// Background Upload Processor
const processItemUpload = (itemId, filePath, filename, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`[AsyncUpload] Starting Flickr upload for Item ${itemId}`);
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: { uploadStatus: 'UPLOADING' }
        });
        const imageBuffer = fs_1.default.readFileSync(filePath);
        const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, `item_${itemId}_${Date.now()}_${filename}`, `Item ${itemId}`, 'wishlist-app');
        if (flickrUrl) {
            console.log(`[AsyncUpload] ✅ Flickr upload successful for Item ${itemId}: ${flickrUrl}`);
            yield prisma_1.default.item.update({
                where: { id: itemId },
                data: {
                    imageUrl: flickrUrl,
                    uploadStatus: 'COMPLETED'
                }
            });
            // Clean up local file
            try {
                fs_1.default.unlinkSync(filePath);
            }
            catch (e) {
                console.warn(`[AsyncUpload] Failed to delete temp file:`, e);
            }
            // Trigger AI analysis with Flickr URL (pass userId for quota check)
            processItemAi(itemId, flickrUrl, filename, userId);
        }
        else {
            console.error(`[AsyncUpload] ❌ Flickr upload failed for Item ${itemId}`);
            yield prisma_1.default.item.update({
                where: { id: itemId },
                data: { uploadStatus: 'FAILED' }
            });
            // Still try AI with local file
            processItemAi(itemId, filePath, filename, userId);
        }
    }
    catch (error) {
        console.error(`[AsyncUpload] Error for Item ${itemId}:`, error);
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: {
                uploadStatus: 'FAILED',
                aiError: error.message
            }
        });
    }
});
const createItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { wishlistId } = req.params;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Image is required' });
        }
        // 1. Create Item immediately with local preview
        const item = yield prisma_1.default.item.create({
            data: {
                name: 'Analyzing...', // Placeholder
                wishlistId: Number(wishlistId),
                imageUrl: `/uploads/${file.filename}`, // Temporary local path
                uploadStatus: 'PENDING',
                aiStatus: 'PENDING'
            }
        });
        // 2. Return response immediately (100ms instead of 4000ms!)
        res.status(201).json(item);
        // 3. Trigger background upload + AI processing (pass userId for quota check)
        processItemUpload(item.id, file.path, file.originalname, userId);
    }
    catch (error) {
        console.error('Create Item Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.createItem = createItem;
const deleteItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        console.log(`[DeleteItem] User ${userId} attempting to delete Item ${id}`);
        const item = yield prisma_1.default.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true }
        });
        if (!item) {
            console.log(`[DeleteItem] Item ${id} not found`);
            return res.status(404).json({ error: 'Item not found' });
        }
        if (item.wishlist.userId !== userId) {
            console.log(`[DeleteItem] Permission denied. Owner: ${item.wishlist.userId}, Requester: ${userId}`);
            return res.status(403).json({ error: 'Access denied: You do not own this wishlist item' });
        }
        yield prisma_1.default.item.delete({ where: { id: Number(id) } });
        console.log(`[DeleteItem] Success`);
        res.json({ message: 'Item deleted' });
    }
    catch (error) {
        console.error('Delete Item Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.deleteItem = deleteItem;
const updateItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { isHidden, isPurchased, name, price, notes, link } = req.body; // Add other fields if needed
        const item = yield prisma_1.default.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true }
        });
        if (!item)
            return res.status(404).json({ error: 'Item not found' });
        const isOwner = item.wishlist.userId === userId;
        // Permissions Check
        if (!isOwner) {
            // Non-owners can ONLY update isPurchased
            if (isHidden !== undefined || name || price || notes || link) {
                return res.status(403).json({ error: 'Access denied: Only owner can edit details' });
            }
            // Ensure wishlist is public? Or accessible?
            // Assuming if they have the link/ID and it's public.
            if (!item.wishlist.isPublic) {
                // Check if actually strictly private?
                // For now, consistent with getWishlist logic in frontend
            }
        }
        const dataToUpdate = {};
        // Owner fields
        if (isOwner) {
            if (isHidden !== undefined)
                dataToUpdate.isHidden = isHidden;
            if (name)
                dataToUpdate.name = name;
            if (price)
                dataToUpdate.price = price;
            if (notes)
                dataToUpdate.notes = notes;
            if (link)
                dataToUpdate.link = link;
        }
        // Purchase Logic (Anyone allowed to mark purchased if they can view it)
        if (isPurchased !== undefined) {
            dataToUpdate.isPurchased = isPurchased;
            if (isPurchased) {
                dataToUpdate.purchasedById = userId;
            }
            else {
                dataToUpdate.purchasedById = null;
            }
        }
        const updated = yield prisma_1.default.item.update({
            where: { id: Number(id) },
            data: dataToUpdate
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Update Item Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updateItem = updateItem;
// Async URL Processor
const processUrlAi = (itemId, url, userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log(`[AsyncURL] Processing ${url} for Item ${itemId}`);
        // PROACTIVE SMART SEARCH: Skip direct scraping for known blocked sites
        // These sites block cloud IPs, so we use Google Custom Search + AI
        const momoMatch = url.match(/momoshop\.com\.tw.*[?&]i_code=(\d+)/i);
        if (momoMatch && momoMatch[1]) {
            const iCode = momoMatch[1];
            // D15 FIX: Use Google Custom Search API first for reliable context
            // Then pass the context to Gemini for parsing
            const query = `momo購物網 ${iCode}`;
            console.log(`[AsyncURL] Proactive Smart Search for Momo i_code: ${iCode}`);
            // Try Google Custom Search first for reliable product info
            const searchContext = yield (0, aiController_1.searchGoogleWeb)(query);
            if (searchContext) {
                console.log(`[AsyncURL] Got search context: ${searchContext.title}`);
            }
            else {
                console.log(`[AsyncURL] No search context found, AI will try grounding`);
            }
            yield processTextAi(itemId, url, userId, searchContext, query);
            return;
        }
        // 1. Fetch HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        let html = '';
        try {
            const headers = getRandomHeaders();
            const response = yield fetch(url, {
                headers: headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            html = yield response.text();
            // Scraping Success
            const $ = cheerio.load(html);
            // 1. Check for Soft Block / Captcha / Access Denied (Common in Shopee/Amazon)
            const pageTitle = $('title').text().trim().toLowerCase();
            const bodyText = $('body').text().toLowerCase();
            const isSoftBlock = pageTitle.includes('robot') ||
                pageTitle.includes('shopee') && pageTitle.includes('login') ||
                pageTitle.includes('access denied') ||
                pageTitle.includes('verify you are human');
            if (isSoftBlock) {
                console.warn(`[AsyncURL] Soft block detected (Title: "${pageTitle}"), forcing AI fallback...`);
                throw new Error('Soft Block Detected');
            }
            // ... (Extract logic mostly same as before) ...
            let imageUrl = $('meta[property="og:image"]').attr('content') ||
                $('meta[name="twitter:image"]').attr('content') ||
                $('link[rel="image_src"]').attr('href') ||
                $('img').first().attr('src');
            if (imageUrl) {
                if (!imageUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
                }
                // Download Image
                const imageRes = yield fetch(imageUrl);
                const arrayBuffer = yield imageRes.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                const filename = `url_${itemId}_${Date.now()}.jpg`;
                const savePath = path_1.default.join('public', 'uploads', filename);
                const dbImageUrl = `/uploads/${filename}`;
                fs_1.default.writeFileSync(savePath, imageBuffer);
                let finalImageUrl = dbImageUrl;
                // Flickr Persistence
                const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, filename, `Scraped Item ${itemId}`);
                if (flickrUrl) {
                    finalImageUrl = flickrUrl;
                }
                // Update Item with Image
                yield prisma_1.default.item.update({
                    where: { id: itemId },
                    data: { imageUrl: finalImageUrl }
                });
                // Trigger Image AI (pass userId for quota check)
                yield processItemAi(itemId, savePath, 'url_image.jpg', userId);
                return;
            }
            else {
                // No image found, treat as scraping failure to trigger fallback
                throw new Error('No image found on page');
            }
        }
        catch (fetchError) {
            console.warn(`[AsyncURL] Web scraping failed (${fetchError.message}), checking AI fallback...`);
            // SMART FALLBACK LOGIC
            // 1. If it's Shopee/Amazon with IDs, use Smart Search
            let searchContext = null;
            // Shopee regex: shopee.tw/product/SHOP_ID/ITEM_ID or name-i.SHOP.ITEM
            const shopeeMatch = url.match(/shopee\.tw\/product\/(\d+)\/(\d+)/i) ||
                url.match(/shopee\.tw\/.*?-i\.(\d+)\.(\d+)/i);
            if (shopeeMatch) {
                const id1 = shopeeMatch[1];
                const id2 = shopeeMatch[2];
                if (id1 && id2) {
                    const query = `site:shopee.tw "${id1}" "${id2}"`;
                    console.log(`[AsyncURL] Smart Search for Shopee IDs: ${id1}, ${id2} (Query: ${query})`);
                    // Even if custom search fails (returns null), we pass the QUERY string as a hint to Gemini!
                    // This is the key fix: Let Gemini do the search using this exact query string.
                    searchContext = yield (0, aiController_1.searchGoogleWeb)(query);
                    if (!searchContext) {
                        // Pass the query itself as a "context" object or separate arg?
                        // We need to update processTextAi signature to accept this hint.
                        // Let's pass it via a modified call.
                        yield processTextAi(itemId, url, userId, null, query);
                        return;
                    }
                }
            }
            // Momo regex: momoshop.com.tw/goods/GoodsDetail.jsp?i_code=XXXXXX
            const momoMatch = url.match(/momoshop\.com\.tw.*[?&]i_code=(\d+)/i);
            if (momoMatch && momoMatch[1]) {
                const iCode = momoMatch[1];
                const query = `site:momoshop.com.tw i_code=${iCode}`;
                console.log(`[AsyncURL] Smart Search for Momo i_code: ${iCode} (Query: ${query})`);
                searchContext = yield (0, aiController_1.searchGoogleWeb)(query);
                if (!searchContext) {
                    yield processTextAi(itemId, url, userId, null, query);
                    return;
                }
            }
            // PChome regex: 24h.pchome.com.tw/prod/XXXXX
            const pchomeMatch = url.match(/pchome\.com\.tw\/prod\/([A-Z0-9-]+)/i);
            if (pchomeMatch && pchomeMatch[1]) {
                const prodId = pchomeMatch[1];
                const query = `site:pchome.com.tw ${prodId}`;
                console.log(`[AsyncURL] Smart Search for PChome prod: ${prodId} (Query: ${query})`);
                searchContext = yield (0, aiController_1.searchGoogleWeb)(query);
                if (!searchContext) {
                    yield processTextAi(itemId, url, userId, null, query);
                    return;
                }
            }
            // AI Fallback Logic:
            try {
                console.log(`[AsyncURL] Fallback: Asking Gemini to analyze URL: ${url} (Context: ${(searchContext === null || searchContext === void 0 ? void 0 : searchContext.title) || 'None'})`);
                yield processTextAi(itemId, url, userId, searchContext);
                return;
            }
            catch (fallbackError) {
                console.error(`[AsyncURL] AI Fallback failed too:`, fallbackError);
                // Log crawler failure to database
                yield prisma_1.default.crawlerLog.create({
                    data: {
                        userId,
                        url,
                        errorMessage: fetchError.message || 'Unknown fetch error',
                        debugMessage: `AI Fallback also failed: ${fallbackError.message}`
                    }
                });
                yield prisma_1.default.item.update({
                    where: { id: itemId },
                    data: {
                        aiStatus: 'FAILED',
                        aiError: `無法讀取網頁且 AI 分析失敗 (${fetchError.message})`
                    }
                });
            }
        }
    }
    catch (error) {
        console.error(`[AsyncURL] Fatal error for Item ${itemId}:`, error);
        // Log fatal crawler error to database
        yield prisma_1.default.crawlerLog.create({
            data: {
                userId,
                url,
                errorMessage: error.message || 'Unknown fatal error',
                debugMessage: ((_a = error.stack) === null || _a === void 0 ? void 0 : _a.substring(0, 500)) || null
            }
        });
        yield prisma_1.default.item.update({ where: { id: itemId }, data: { aiStatus: 'FAILED', aiError: error.message } });
    }
});
// Force Redeploy: Triggering new build for D9 Fix (Image Download User-Agent)
const downloadImage = (url, itemId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const headers = getRandomHeaders(); // Reuse existing pool
        const imageRes = yield fetch(url, { headers });
        if (!imageRes.ok) {
            console.warn(`[DownloadImage] Failed to fetch ${url} (Status: ${imageRes.status})`);
            return null;
        }
        const arrayBuffer = yield imageRes.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const filename = `ai_${itemId}_${Date.now()}.jpg`;
        // Ensure directory exists
        const uploadDir = path_1.default.join('public', 'uploads');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        const savePath = path_1.default.join(uploadDir, filename);
        fs_1.default.writeFileSync(savePath, imageBuffer);
        let finalPath = `/uploads/${filename}`;
        // Flickr Persistence
        const flickrUrl = yield flickr_1.flickrService.uploadImage(imageBuffer, filename, `Downloaded Item ${itemId}`);
        if (flickrUrl) {
            finalPath = flickrUrl;
        }
        return finalPath;
    }
    catch (e) {
        console.error(`Failed to download image from ${url}:`, e);
        return null; // Fail gracefully
    }
});
const processTextAi = (itemId_1, text_1, userId_1, ...args_1) => __awaiter(void 0, [itemId_1, text_1, userId_1, ...args_1], void 0, function* (itemId, text, userId, searchContext = null, suggestedQuery = null) {
    try {
        console.log(`[AsyncText] Processing text "${text}" for Item ${itemId} (Query Hint: ${suggestedQuery})`);
        // Check AI quota BEFORE calling AI
        const canUseAi = yield (0, usageService_1.checkAndIncrementAiUsage)(userId);
        if (!canUseAi) {
            console.log(`[AsyncText] User ${userId} exceeded AI limit - using Traditional Mode`);
            // Traditional Mode: Use search context if available, otherwise just store the text
            const fallbackName = (searchContext === null || searchContext === void 0 ? void 0 : searchContext.title) || text.substring(0, 100);
            const fallbackImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=random&size=200`;
            yield prisma_1.default.item.update({
                where: { id: itemId },
                data: {
                    name: fallbackName,
                    notes: '每日 AI 辨識額度已用完，請手動編輯商品資訊。',
                    imageUrl: fallbackImage,
                    aiStatus: 'SKIPPED',
                    aiError: 'Daily AI limit exceeded'
                }
            });
            return;
        }
        const result = yield (0, aiController_1.analyzeProductText)(text, 'traditional chinese', searchContext, suggestedQuery);
        // Option C: Use original image URL directly (no download)
        // Railway's ephemeral filesystem causes downloaded images to disappear on redeploy
        // TODO: Consider Cloudinary for persistent image storage in the future
        let finalImageUrl = result.imageUrl || null;
        // Fallback if no image URL from AI
        if (!finalImageUrl) {
            // Generate a placeholder based on product name
            const lowerName = (result.name || text).toLowerCase();
            if (lowerName.includes('sony') || lowerName.includes('headphone') || lowerName.includes('audio')) {
                finalImageUrl = '/uploads/fallback_tech.png';
            }
            else {
                finalImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.name || text)}&background=random&size=200`;
            }
        }
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: {
                name: result.name || text,
                price: result.price ? String(result.price) : undefined,
                currency: result.currency,
                aiLink: result.shoppingLink, // Save to aiLink, not link (user link)
                imageUrl: finalImageUrl, // Use local path or fallback
                notes: result.description,
                aiStatus: 'COMPLETED',
                aiError: null
            }
        });
    }
    catch (error) {
        console.error(`[AsyncText] Failed for Item ${itemId}:`, error);
        // Log AI errors to CrawlerLog for monitoring
        yield prisma_1.default.crawlerLog.create({
            data: {
                userId,
                url: text, // The input text or URL
                errorMessage: error.message || 'Unknown AI error',
                debugMessage: `AI processing failed. Suggested query: ${suggestedQuery || 'None'}`
            }
        });
        yield prisma_1.default.item.update({
            where: { id: itemId },
            data: { aiStatus: 'FAILED', aiError: error.message }
        });
    }
});
const createItemFromUrl = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { wishlistId } = req.params;
        const { url } = req.body; // 'url' is the field name from frontend, but can be text
        if (!url)
            return res.status(400).json({ error: 'Input is required' });
        const isUrl = url.trim().match(/^(http|https):\/\//);
        // 1. Create PENDING Item Immediately
        const item = yield prisma_1.default.item.create({
            data: {
                name: isUrl ? 'Processing Link...' : url, // Use input as name if text
                wishlistId: Number(wishlistId),
                link: isUrl ? url : null,
                imageUrl: null,
                aiStatus: 'PENDING'
            }
        });
        // 2. Return Response
        res.status(201).json(item);
        // 3. Trigger Async Processing
        if (isUrl) {
            processUrlAi(item.id, url, userId);
        }
        else {
            processTextAi(item.id, url, userId);
        }
    }
    catch (error) {
        console.error('Create Item URL/Text Error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});
exports.createItemFromUrl = createItemFromUrl;
// Clone an item to my own wishlist
const cloneItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params; // ID of item to clone
        const { targetWishlistId } = req.body; // Optional target
        // 1. Get source item
        const sourceItem = yield prisma_1.default.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true } // Need wishlist to check original owner if originalUserId is null
        });
        if (!sourceItem)
            return res.status(404).json({ error: 'Item not found' });
        let targetId = targetWishlistId;
        // 2. Validate Target or Find Default
        if (targetId) {
            // Verify ownership
            const wishlist = yield prisma_1.default.wishlist.findFirst({
                where: { id: Number(targetId), userId: userId }
            });
            if (!wishlist)
                return res.status(403).json({ error: 'Invalid target wishlist' });
        }
        else {
            // Default to first available
            const userWishlist = yield prisma_1.default.wishlist.findFirst({
                where: { userId: userId },
                orderBy: { createdAt: 'asc' }
            });
            if (!userWishlist) {
                return res.status(400).json({ error: 'You need to create a wishlist first' });
            }
            targetId = userWishlist.id;
        }
        // 3. Duplicate Item with Deep Persistence
        // If sourceItem has originalUserId, it means it was already cloned or tracked. Preserve it.
        // If NOT, then the *Creator* of that sourceItem is the original wisher.
        // sourceItem.wishlist.userId is the owner of the list the item is currently in.
        const originalWisherId = sourceItem.originalUserId || sourceItem.wishlist.userId;
        const newItem = yield prisma_1.default.item.create({
            data: {
                name: sourceItem.name,
                price: sourceItem.price,
                currency: sourceItem.currency,
                link: sourceItem.link,
                aiLink: sourceItem.aiLink, // Copy AI link as well
                imageUrl: sourceItem.imageUrl,
                notes: sourceItem.notes,
                wishlistId: Number(targetId),
                aiStatus: 'COMPLETED', // Already processed
                isHidden: false,
                originalUserId: originalWisherId // Persist the deep original wisher
            }
        });
        res.status(201).json(newItem);
    }
    catch (error) {
        console.error('Clone Item Error:', error);
        res.status(500).json({ error: 'Failed to clone item' });
    }
});
exports.cloneItem = cloneItem;
// Watch an item
const watchItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { id } = req.params; // Item ID
        yield prisma_1.default.itemWatch.create({
            data: {
                userId: userId,
                itemId: Number(id)
            }
        });
        res.json({ message: 'Item watched successfully' });
    }
    catch (error) {
        // P2002: Unique constraint violation
        if (error.code === 'P2002') {
            return res.json({ message: 'Already watching' });
        }
        console.error('Watch Item Error:', error);
        res.status(500).json({ error: 'Failed to watch item' });
    }
});
exports.watchItem = watchItem;
// Get single item details (Public/Visitor view)
const getItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const item = yield prisma_1.default.item.findUnique({
            where: { id: Number(id) },
            include: {
                wishlist: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                avatarUrl: true
                            }
                        }
                    }
                }
            }
        });
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(item);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getItem = getItem;
const getPublicItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const items = yield prisma_1.default.item.findMany({
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: {
                wishlist: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                avatarUrl: true
                            }
                        }
                    }
                }
            }
        });
        res.json(items);
    }
    catch (error) {
        console.error('Error fetching public items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getPublicItems = getPublicItems;
