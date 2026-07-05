import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { analyzeLocalImage, analyzeProductText, searchGoogleWeb } from './aiController';
import fs from 'fs';
import * as cheerio from 'cheerio';
import path from 'path';
import { flickrService } from '../lib/flickr';
import { checkAndIncrementAiUsage } from '../lib/usageService';
import { parseEclawPublicCode, verifyPublicCode, ECLAW_PUBLIC_CODE_PREFIX } from '../lib/eclawBridge';

interface AuthRequest extends Request {
    user?: any;
    merchant?: any;
    // Set by authenticateEclawAgent (card_e30cf03d): the caller's OWN verified
    // EClaw public code. NO merchant key. The write binds proxy_end_user_id to it.
    eclawAgent?: { publicCode: string };
}

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
const processItemAi = async (itemId: number, imagePathOrUrl: string, originalName: string, userId: number) => {
    try {
        console.log(`[AsyncAI] Starting analysis for Item ${itemId}`);

        // Check AI quota
        const canUseAi = await checkAndIncrementAiUsage(userId);
        if (!canUseAi) {
            console.log(`[AsyncAI] User ${userId} exceeded AI limit - using Traditional Mode`);
            await prisma.item.update({
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

        let imageBuffer: Buffer;

        // Check if it's a URL or local file path
        if (imagePathOrUrl.startsWith('http')) {
            // Download from URL (Flickr URL)
            console.log(`[AsyncAI] Downloading image from URL: ${imagePathOrUrl}`);
            const response = await fetch(imagePathOrUrl);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
        } else {
            // Read from local file path
            imageBuffer = fs.readFileSync(imagePathOrUrl);
        }

        const fileForAi = {
            buffer: imageBuffer,
            mimetype: 'image/jpeg', // simplified, or detect from path
            originalname: originalName
        };

        const aiResult = await analyzeLocalImage(fileForAi); // We need to export this from aiController

        // Update Item with results
        await prisma.item.update({
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
                const flickrUrl = await flickrService.uploadImage(
                    imageBuffer,
                    `item_${itemId}_${Date.now()}.jpg`,
                    `Item ${itemId} - ${aiResult.name || originalName}`
                );

                if (flickrUrl) {
                    console.log(`[AsyncAI] Migrated Item ${itemId} to Flickr: ${flickrUrl}`);
                    await prisma.item.update({
                        where: { id: itemId },
                        data: { imageUrl: flickrUrl }
                    });

                    // Clean up local file after successful Flickr upload
                    try {
                        fs.unlinkSync(imagePathOrUrl);
                    } catch (e) {
                        console.warn(`[AsyncAI] Failed to delete temp file:`, e);
                    }
                }
            } catch (flickrErr) {
                console.error(`[AsyncAI] Flickr upload failed for Item ${itemId}`, flickrErr);
                // Continue, don't fail the whole process
            }
        }

        console.log(`[AsyncAI] Completed Item ${itemId}`);

    } catch (error: any) {
        console.error(`[AsyncAI] Failed for Item ${itemId}:`, error);
        await prisma.item.update({
            where: { id: itemId },
            data: {
                aiStatus: 'FAILED',
                aiError: error.message || 'Unknown error'
            }
        });
    }
};

// Background Upload Processor
const processItemUpload = async (itemId: number, filePath: string, filename: string, userId: number) => {
    try {
        console.log(`[AsyncUpload] Starting Flickr upload for Item ${itemId}`);

        await prisma.item.update({
            where: { id: itemId },
            data: { uploadStatus: 'UPLOADING' }
        });

        const imageBuffer = fs.readFileSync(filePath);
        const flickrUrl = await flickrService.uploadImage(
            imageBuffer,
            `item_${itemId}_${Date.now()}_${filename}`,
            `Item ${itemId}`,
            'wishlist-app'
        );

        if (flickrUrl) {
            console.log(`[AsyncUpload] ✅ Flickr upload successful for Item ${itemId}: ${flickrUrl}`);
            await prisma.item.update({
                where: { id: itemId },
                data: {
                    imageUrl: flickrUrl,
                    uploadStatus: 'COMPLETED'
                }
            });

            // Clean up local file
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.warn(`[AsyncUpload] Failed to delete temp file:`, e);
            }

            // Trigger AI analysis with Flickr URL (pass userId for quota check)
            processItemAi(itemId, flickrUrl, filename, userId);
        } else {
            console.error(`[AsyncUpload] ❌ Flickr upload failed for Item ${itemId}`);
            await prisma.item.update({
                where: { id: itemId },
                data: { uploadStatus: 'FAILED' }
            });
            // Still try AI with local file
            processItemAi(itemId, filePath, filename, userId);
        }

    } catch (error: any) {
        console.error(`[AsyncUpload] Error for Item ${itemId}:`, error);
        await prisma.item.update({
            where: { id: itemId },
            data: {
                uploadStatus: 'FAILED',
                aiError: error.message
            }
        });
    }
};

export const createItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        // An EClaw agent verified by authenticateEclawAgent (NO merchant key).
        const agentPublicCode: string | undefined = req.eclawAgent?.publicCode;

        if (!userId && !agentPublicCode) {
            return res.status(401).json({ error: 'Unauthorized', errorCode: API_ERROR_CODES.MISSING_TOKEN });
        }

        const { wishlistId } = req.params;
        const { proxy_end_user_id } = req.body;
        const file = req.file;

        // Check if wishlist exists
        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(wishlistId) }
        });

        if (!wishlist) {
            return res.status(404).json({
                error: 'Wishlist not found',
                errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND
            });
        }

        // Ownership check: If User auth, must be owner. If Merchant, maybe bypass?
        // For now, let's assume merchants can add to any wishlist if they have the ID, 
        // OR we should check if the merchant is authorized for this user.
        // Simplest: If User is logged in, check ownership. If ONLY Merchant, bypass ownership but require wishlistId.
        if (userId && wishlist.userId !== userId) {
            return res.status(403).json({
                error: 'Access denied: You do not own this wishlist',
                errorCode: API_ERROR_CODES.ACCESS_DENIED
            });
        }

        // Image is optional now - use placeholder if missing
        let imageUrl = null;
        if (file) {
            imageUrl = `/uploads/${file.filename}`;
        } else {
            // Use a default placeholder for text-only items
            imageUrl = 'https://ui-avatars.com/api/?name=Item&background=random';
        }

        // Validate Price
        let validatedPrice: string | null = null;
        if (req.body.price) {
            // If number or numeric string
            if (!isNaN(Number(req.body.price))) {
                validatedPrice = String(req.body.price);
            } else {
                return res.status(400).json({
                    error: 'Price must be a number',
                    errorCode: API_ERROR_CODES.INVALID_INPUT
                });
            }
        }

        const { name, notes } = req.body;
        if (name && name.length > 200) {
            return res.status(400).json({ error: 'Name too long (Max 200)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        if (notes && notes.length > 1000) {
            return res.status(400).json({ error: 'Notes too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // SECURITY (review HIGH #1 + card_e30cf03d): proxy_end_user_id is untrusted
        // input. Two cases:
        //   (A) The caller is a VERIFIED EClaw AGENT (authenticateEclawAgent proved
        //       it against EClaw → req.eclawAgent.publicCode). The item is ALWAYS
        //       bound to THAT verified code; any eclaw: code in the body that names
        //       a DIFFERENT entity is rejected (a caller can't write under a code
        //       it does not control). No merchant key, no re-verify needed.
        //   (B) The caller is a logged-in USER tagging an `eclaw:<code>`. That code
        //       MUST resolve against EClaw's public-code index (P1 anti-spoof) or
        //       the write is rejected; an EClaw outage fails CLOSED (503).
        // A non-eclaw proxy_end_user_id is stored as-is (opaque external id).
        let safeProxyId: string | null = null;
        if (agentPublicCode) {
            // (A) Verified agent: bind to its own code, reject a foreign claim.
            const claimed = parseEclawPublicCode(proxy_end_user_id);
            if (claimed && claimed !== agentPublicCode) {
                return res.status(403).json({
                    error: 'Cannot write an item under an EClaw code you do not control',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            safeProxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${agentPublicCode}`;
        } else if (proxy_end_user_id != null && String(proxy_end_user_id).length > 0) {
            const eclawCode = parseEclawPublicCode(proxy_end_user_id);
            if (eclawCode) {
                const verified = await verifyPublicCode(eclawCode);
                if (!verified.ok) {
                    if (verified.reason === 'upstream_error') {
                        return res.status(503).json({
                            error: 'EClaw public-code verification unavailable; try again later',
                            errorCode: API_ERROR_CODES.INTERNAL_ERROR,
                        });
                    }
                    return res.status(403).json({
                        error: 'proxy_end_user_id names an EClaw code that does not resolve to a real entity',
                        errorCode: API_ERROR_CODES.ACCESS_DENIED,
                    });
                }
                // Canonicalize to the verified code.
                safeProxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${verified.entity!.publicCode}`;
            } else if (String(proxy_end_user_id).toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)) {
                // Claims to be an eclaw identity but is malformed → reject.
                return res.status(400).json({
                    error: 'Malformed eclaw: proxy_end_user_id',
                    errorCode: API_ERROR_CODES.INVALID_INPUT,
                });
            } else {
                // Opaque non-EClaw external id: store as-is (never trusted for identity).
                safeProxyId = String(proxy_end_user_id).slice(0, 128);
            }
        }

        const item = await prisma.item.create({
            data: {
                name: req.body.name || 'New Item',
                wishlistId: Number(wishlistId),
                imageUrl: imageUrl,
                uploadStatus: file ? 'PENDING' : 'COMPLETED',
                aiStatus: file ? 'PENDING' : 'SKIPPED',
                notes: req.body.notes || null,
                price: validatedPrice,
                proxy_end_user_id: safeProxyId
            }
        });

        // 2. Return response immediately (100ms instead of 4000ms!)
        res.status(201).json(item);

        // 3. Trigger background upload + AI processing ONLY if file exists
        if (file && (userId || wishlist.userId)) {
            processItemUpload(item.id, file.path, file.originalname, userId || wishlist.userId);
        }

    } catch (error) {
        console.error('Create Item Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const deleteItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        console.log(`[DeleteItem] User ${userId} attempting to delete Item ${id}`);

        const item = await prisma.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true }
        });

        if (!item) {
            console.log(`[DeleteItem] Item ${id} not found`);
            return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });
        }

        if (item.wishlist.userId !== userId) {
            console.log(`[DeleteItem] Permission denied. Owner: ${item.wishlist.userId}, Requester: ${userId}`);
            return res.status(403).json({ error: 'Access denied: You do not own this wishlist item', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        }

        await prisma.item.delete({ where: { id: Number(id) } });
        console.log(`[DeleteItem] Success`);

        res.json({ message: 'Item deleted' });
    } catch (error) {
        console.error('Delete Item Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const { isHidden, isPurchased, name, price, notes, link } = req.body; // Add other fields if needed

        if (name && name.length > 200) {
            return res.status(400).json({ error: 'Name too long (Max 200)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        if (notes && notes.length > 1000) {
            return res.status(400).json({ error: 'Notes too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const item = await prisma.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true }
        });

        if (!item) return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });

        const isOwner = item.wishlist.userId === userId;

        // Permissions Check
        if (!isOwner) {
            // Non-owners can ONLY update isPurchased
            if (isHidden !== undefined || name || price || notes || link) {
                return res.status(403).json({ error: 'Access denied: Only owner can edit details', errorCode: API_ERROR_CODES.ACCESS_DENIED });
            }
            // Ensure wishlist is public? Or accessible?
            // Assuming if they have the link/ID and it's public.
            if (!item.wishlist.isPublic) {
                // Check if actually strictly private?
                // For now, consistent with getWishlist logic in frontend
            }
        }

        const dataToUpdate: any = {};

        // Owner fields
        if (isOwner) {
            if (isHidden !== undefined) dataToUpdate.isHidden = isHidden;
            if (name) dataToUpdate.name = name;
            if (price) dataToUpdate.price = price;
            if (notes) dataToUpdate.notes = notes;
            if (link) dataToUpdate.link = link;
        }

        // Purchase Logic (Anyone allowed to mark purchased if they can view it)
        if (isPurchased !== undefined) {
            dataToUpdate.isPurchased = isPurchased;
            if (isPurchased) {
                dataToUpdate.purchasedById = userId;
            } else {
                dataToUpdate.purchasedById = null;
            }
        }

        const updated = await prisma.item.update({
            where: { id: Number(id) },
            data: dataToUpdate
        });

        res.json(updated);
    } catch (error) {
        console.error('Update Item Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Async URL Processor
const processUrlAi = async (itemId: number, url: string, userId: number) => {
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
            const searchContext = await searchGoogleWeb(query);
            if (searchContext) {
                console.log(`[AsyncURL] Got search context: ${searchContext.title}`);
            } else {
                console.log(`[AsyncURL] No search context found, AI will try grounding`);
            }

            await processTextAi(itemId, url, userId, searchContext, query);
            return;
        }

        // 1. Fetch HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        let html = '';
        try {
            const headers = getRandomHeaders();
            const response = await fetch(url, {
                headers: headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            html = await response.text();

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
                const imageRes = await fetch(imageUrl);
                const arrayBuffer = await imageRes.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                const filename = `url_${itemId}_${Date.now()}.jpg`;
                const savePath = path.join('public', 'uploads', filename);
                const dbImageUrl = `/uploads/${filename}`;
                fs.writeFileSync(savePath, imageBuffer);

                let finalImageUrl = dbImageUrl;

                // Flickr Persistence
                const flickrUrl = await flickrService.uploadImage(
                    imageBuffer,
                    filename,
                    `Scraped Item ${itemId}`
                );
                if (flickrUrl) {
                    finalImageUrl = flickrUrl;
                }

                // Update Item with Image
                await prisma.item.update({
                    where: { id: itemId },
                    data: { imageUrl: finalImageUrl }
                });

                // Trigger Image AI (pass userId for quota check)
                await processItemAi(itemId, savePath, 'url_image.jpg', userId);
                return;
            } else {
                // No image found, treat as scraping failure to trigger fallback
                throw new Error('No image found on page');
            }

        } catch (fetchError: any) {
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
                    searchContext = await searchGoogleWeb(query);
                    if (!searchContext) {
                        // Pass the query itself as a "context" object or separate arg?
                        // We need to update processTextAi signature to accept this hint.
                        // Let's pass it via a modified call.
                        await processTextAi(itemId, url, userId, null, query);
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
                searchContext = await searchGoogleWeb(query);
                if (!searchContext) {
                    await processTextAi(itemId, url, userId, null, query);
                    return;
                }
            }

            // PChome regex: 24h.pchome.com.tw/prod/XXXXX
            const pchomeMatch = url.match(/pchome\.com\.tw\/prod\/([A-Z0-9-]+)/i);
            if (pchomeMatch && pchomeMatch[1]) {
                const prodId = pchomeMatch[1];
                const query = `site:pchome.com.tw ${prodId}`;
                console.log(`[AsyncURL] Smart Search for PChome prod: ${prodId} (Query: ${query})`);
                searchContext = await searchGoogleWeb(query);
                if (!searchContext) {
                    await processTextAi(itemId, url, userId, null, query);
                    return;
                }
            }

            // AI Fallback Logic:
            try {
                console.log(`[AsyncURL] Fallback: Asking Gemini to analyze URL: ${url} (Context: ${searchContext?.title || 'None'})`);
                await processTextAi(itemId, url, userId, searchContext);
                return;
            } catch (fallbackError: any) {
                console.error(`[AsyncURL] AI Fallback failed too:`, fallbackError);

                // Log crawler failure to database
                await prisma.crawlerLog.create({
                    data: {
                        userId,
                        url,
                        errorMessage: fetchError.message || 'Unknown fetch error',
                        debugMessage: `AI Fallback also failed: ${fallbackError.message}`
                    }
                });

                await prisma.item.update({
                    where: { id: itemId },
                    data: {
                        aiStatus: 'FAILED',
                        aiError: `無法讀取網頁且 AI 分析失敗 (${fetchError.message})`
                    }
                });
            }
        }
    } catch (error: any) {
        console.error(`[AsyncURL] Fatal error for Item ${itemId}:`, error);

        // Log fatal crawler error to database
        await prisma.crawlerLog.create({
            data: {
                userId,
                url,
                errorMessage: error.message || 'Unknown fatal error',
                debugMessage: error.stack?.substring(0, 500) || null
            }
        });

        await prisma.item.update({ where: { id: itemId }, data: { aiStatus: 'FAILED', aiError: error.message } });
    }
};

// Force Redeploy: Triggering new build for D9 Fix (Image Download User-Agent)
const downloadImage = async (url: string, itemId: number): Promise<string | null> => {
    try {
        const headers = getRandomHeaders(); // Reuse existing pool
        const imageRes = await fetch(url, { headers });
        if (!imageRes.ok) {
            console.warn(`[DownloadImage] Failed to fetch ${url} (Status: ${imageRes.status})`);
            return null;
        }
        const arrayBuffer = await imageRes.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const filename = `ai_${itemId}_${Date.now()}.jpg`;
        // Ensure directory exists
        const uploadDir = path.join('public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const savePath = path.join(uploadDir, filename);
        fs.writeFileSync(savePath, imageBuffer);

        let finalPath = `/uploads/${filename}`;

        // Flickr Persistence
        const flickrUrl = await flickrService.uploadImage(
            imageBuffer,
            filename,
            `Downloaded Item ${itemId}`
        );
        if (flickrUrl) {
            finalPath = flickrUrl;
        }

        return finalPath;
    } catch (e) {
        console.error(`Failed to download image from ${url}:`, e);
        return null; // Fail gracefully
    }
};

const processTextAi = async (itemId: number, text: string, userId: number, searchContext: any = null, suggestedQuery: string | null = null) => {
    try {
        console.log(`[AsyncText] Processing text "${text}" for Item ${itemId} (Query Hint: ${suggestedQuery})`);

        // Check AI quota BEFORE calling AI
        const canUseAi = await checkAndIncrementAiUsage(userId);
        if (!canUseAi) {
            console.log(`[AsyncText] User ${userId} exceeded AI limit - using Traditional Mode`);

            // Traditional Mode: Use search context if available, otherwise just store the text
            const fallbackName = searchContext?.title || text.substring(0, 100);
            const fallbackImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=random&size=200`;

            await prisma.item.update({
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

        const result = await analyzeProductText(text, 'traditional chinese', searchContext, suggestedQuery);

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
            } else {
                finalImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.name || text)}&background=random&size=200`;
            }
        }

        await prisma.item.update({
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
    } catch (error: any) {
        console.error(`[AsyncText] Failed for Item ${itemId}:`, error);

        // Log AI errors to CrawlerLog for monitoring
        await prisma.crawlerLog.create({
            data: {
                userId,
                url: text, // The input text or URL
                errorMessage: error.message || 'Unknown AI error',
                debugMessage: `AI processing failed. Suggested query: ${suggestedQuery || 'None'}`
            }
        });

        await prisma.item.update({
            where: { id: itemId },
            data: { aiStatus: 'FAILED', aiError: error.message }
        });
    }
};

export const createItemFromUrl = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        // An EClaw agent verified by authenticateEclawAgent (NO merchant key).
        const agentPublicCode: string | undefined = req.eclawAgent?.publicCode;

        if (!userId && !agentPublicCode) {
            return res.status(401).json({ error: 'Unauthorized', errorCode: API_ERROR_CODES.MISSING_TOKEN });
        }

        const { wishlistId } = req.params;
        const { url, proxy_end_user_id } = req.body; // 'url' is the field name from frontend, but can be text

        if (!url) return res.status(400).json({
            error: 'Input is required',
            errorCode: API_ERROR_CODES.INVALID_INPUT
        });

        if (url.length > 2000) {
            return res.status(400).json({ error: 'Input too long (Max 2000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Check if wishlist exists
        const wishlist = await prisma.wishlist.findUnique({
            where: { id: Number(wishlistId) }
        });

        if (!wishlist) {
            return res.status(404).json({
                error: 'Wishlist not found',
                errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND
            });
        }

        if (userId && wishlist.userId !== userId) {
            return res.status(403).json({
                error: 'Access denied: You do not own this wishlist',
                errorCode: API_ERROR_CODES.ACCESS_DENIED
            });
        }

        const isUrl = url.trim().match(/^(http|https):\/\//);

        // Bind proxy_end_user_id: a verified EClaw agent → its OWN code (reject a
        // foreign claim); a user → store an opaque non-eclaw id as-is, but never
        // let an unverified `eclaw:<code>` be trusted from this path.
        let safeProxyId: string | null = null;
        if (agentPublicCode) {
            const claimed = parseEclawPublicCode(proxy_end_user_id);
            if (claimed && claimed !== agentPublicCode) {
                return res.status(403).json({
                    error: 'Cannot write an item under an EClaw code you do not control',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            safeProxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${agentPublicCode}`;
        } else if (proxy_end_user_id != null && String(proxy_end_user_id).length > 0) {
            if (String(proxy_end_user_id).toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)) {
                // A user cannot self-assert an EClaw identity on this path.
                return res.status(403).json({
                    error: 'An eclaw: identity requires a verified EClaw agent',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            safeProxyId = String(proxy_end_user_id).slice(0, 128);
        }

        // 1. Create PENDING Item Immediately
        const item = await prisma.item.create({
            data: {
                name: isUrl ? 'Processing Link...' : url, // Use input as name if text
                wishlistId: Number(wishlistId),
                link: isUrl ? url : null,
                imageUrl: null,
                aiStatus: 'PENDING',
                proxy_end_user_id: safeProxyId
            }
        });

        // 2. Return Response
        res.status(201).json(item);

        // 3. Trigger Async Processing
        const targetUserId = userId || wishlist.userId;
        if (isUrl) {
            processUrlAi(item.id, url, targetUserId);
        } else {
            processTextAi(item.id, url, targetUserId);
        }

    } catch (error) {
        console.error('Create Item URL/Text Error:', error);
        res.status(500).json({ error: 'Failed to create item', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Clone an item to my own wishlist
export const cloneItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params; // ID of item to clone

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const { targetWishlistId } = req.body; // Optional target

        // 1. Get source item
        const sourceItem = await prisma.item.findUnique({
            where: { id: Number(id) },
            include: { wishlist: true } // Need wishlist to check original owner if originalUserId is null
        });
        if (!sourceItem) return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });

        let targetId = targetWishlistId;

        // 2. Validate Target or Find Default
        if (targetId) {
            // Verify ownership
            const wishlist = await prisma.wishlist.findFirst({
                where: { id: Number(targetId), userId: userId }
            });
            if (!wishlist) return res.status(403).json({ error: 'Invalid target wishlist', errorCode: API_ERROR_CODES.ACCESS_DENIED });
        } else {
            // Default to first available
            const userWishlist = await prisma.wishlist.findFirst({
                where: { userId: userId },
                orderBy: { createdAt: 'asc' }
            });
            if (!userWishlist) {
                return res.status(400).json({ error: 'You need to create a wishlist first', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            targetId = userWishlist.id;
        }

        // 3. Duplicate Item with Deep Persistence
        // If sourceItem has originalUserId, it means it was already cloned or tracked. Preserve it.
        // If NOT, then the *Creator* of that sourceItem is the original wisher.
        // sourceItem.wishlist.userId is the owner of the list the item is currently in.
        const originalWisherId = sourceItem.originalUserId || sourceItem.wishlist.userId;

        const newItem = await prisma.item.create({
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
    } catch (error) {
        console.error('Clone Item Error:', error);
        res.status(500).json({ error: 'Failed to clone item', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Watch an item
export const watchItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { id } = req.params; // Item ID

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        await prisma.itemWatch.create({
            data: {
                userId: userId,
                itemId: Number(id)
            }
        });

        res.json({ message: 'Item watched successfully' });
    } catch (error: any) {
        // P2002: Unique constraint violation
        if (error.code === 'P2002') {
            return res.json({ message: 'Already watching' });
        }
        console.error('Watch Item Error:', error);
        res.status(500).json({ error: 'Failed to watch item', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// Get single item details (Public/Visitor view)
export const getItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (isNaN(Number(id))) {
            return res.status(400).json({ error: 'Invalid item ID', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        const item = await prisma.item.findUnique({
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
            return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });
        }

        res.json(item);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const getPublicItems = async (req: Request, res: Response) => {
    try {
        const items = await prisma.item.findMany({
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
    } catch (error) {
        console.error('Error fetching public items:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

// ---------------------------------------------------------------------------
// EClaw matchmaking additions
// ---------------------------------------------------------------------------

const SEARCH_MAX_LIMIT = 50;
const SEARCH_DEFAULT_LIMIT = 20;

/**
 * Coerce a query param into a bounded non-negative integer.
 * Falls back to `fallback` on missing/NaN; caps at `max`.
 */
const clampInt = (raw: unknown, fallback: number, max: number): number => {
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(Math.floor(n), max);
};

/**
 * GET /api/items/search?q=&limit=&offset=
 *
 * Net-new public search endpoint. REPLACES the previously-ignored `?q=` on
 * getPublicItems. Case-insensitive `contains` over item name + notes, paginated
 * via limit/offset. Public (no auth) — mirrors GET /api/items/public — but only
 * returns non-hidden items and never leaks proxy_end_user_id/owner PII.
 */
export const searchItems = async (req: Request, res: Response) => {
    try {
        const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
        const q = typeof rawQ === 'string' ? rawQ.trim() : '';

        if (!q) {
            return res.status(400).json({
                error: 'Query parameter "q" is required',
                errorCode: API_ERROR_CODES.INVALID_INPUT,
            });
        }
        if (q.length > 200) {
            return res.status(400).json({
                error: 'Query too long (Max 200)',
                errorCode: API_ERROR_CODES.INVALID_INPUT,
            });
        }

        const limit = clampInt(req.query.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT) || SEARCH_DEFAULT_LIMIT;
        const offset = clampInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);

        const where = {
            isHidden: false,
            // Only items on a PUBLIC wishlist may surface. Wishlist.isPublic
            // defaults to false, so private lists are excluded by construction.
            wishlist: { is: { isPublic: true } },
            OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { notes: { contains: q, mode: 'insensitive' as const } },
            ],
        };

        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                // Explicit select: never expose proxy_end_user_id to the public,
                // and never leak the list owner's name/avatar via search.
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    imageUrl: true,
                    notes: true,
                    link: true,
                    createdAt: true,
                    wishlistId: true,
                    wishlist: {
                        select: {
                            id: true,
                            title: true,
                            isPublic: true,
                        },
                    },
                },
            }),
            prisma.item.count({ where }),
        ]);

        res.json({
            query: q,
            limit,
            offset,
            total,
            count: items.length,
            items,
        });
    } catch (error) {
        console.error('Search Items Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

/**
 * GET /api/items/by-eclaw/:code
 *
 * Seller LIST path for matchmaking: list the items a *verified* EClaw entity
 * has listed (items whose proxy_end_user_id === `eclaw:<code>`). The public
 * code is VERIFIED against EClaw's public-code index before any DB read, so a
 * spoofed `eclaw:` string resolves to nothing. Only public display fields are
 * returned; proxy_end_user_id itself is never echoed.
 */
export const listItemsByEclawCode = async (req: Request, res: Response) => {
    try {
        const code = String(req.params.code || '').trim().toLowerCase();

        const verified = await verifyPublicCode(code);
        if (!verified.ok) {
            // 404 for not_found/bad_format (unknown seller); 502 for upstream.
            if (verified.reason === 'upstream_error') {
                return res.status(502).json({
                    error: 'EClaw public-code verification unavailable',
                    errorCode: API_ERROR_CODES.INTERNAL_ERROR,
                });
            }
            return res.status(404).json({
                error: 'Unknown or unverifiable EClaw public code',
                errorCode: API_ERROR_CODES.USER_NOT_FOUND,
            });
        }

        const limit = clampInt(req.query.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT) || SEARCH_DEFAULT_LIMIT;
        const offset = clampInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
        const proxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${verified.entity!.publicCode}`;

        // Only surface listings that sit on a PUBLIC wishlist (isPublic defaults
        // to false → a seller's items on a private list stay private).
        const where = {
            isHidden: false,
            proxy_end_user_id: proxyId,
            wishlist: { is: { isPublic: true } },
        };
        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    imageUrl: true,
                    notes: true,
                    link: true,
                    createdAt: true,
                    wishlistId: true,
                },
            }),
            prisma.item.count({ where }),
        ]);

        res.json({
            seller: {
                publicCode: verified.entity!.publicCode,
                name: verified.entity!.name,
                character: verified.entity!.character,
            },
            limit,
            offset,
            total,
            count: items.length,
            items,
        });
    } catch (error) {
        console.error('List Items By EClaw Code Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

/**
 * POST /api/items/upsert-listing   (EClaw-agent-authed — NO merchant key)
 *
 * Seller UPSERT path bound to a VERIFIED EClaw agent identity (card_e30cf03d).
 * The authenticateEclawAgent middleware has already proven the caller against
 * EClaw and set req.eclawAgent.publicCode — the listing is ALWAYS written under
 * THAT code. Body: { wishlistId, name, notes?, price?, itemId? }. Any publicCode /
 * proxy_end_user_id in the body that names a DIFFERENT code is rejected (a caller
 * can never write under a code it does not control). If `itemId` is given AND that
 * item already belongs to this verified code, the listing is updated; otherwise a
 * new listing is created.
 */
export const upsertEclawListing = async (req: AuthRequest, res: Response) => {
    try {
        // Identity was proven by authenticateEclawAgent; publicCode is the caller's OWN.
        const code = req.eclawAgent?.publicCode;
        if (!code || !/^[a-z0-9]{6}$/.test(code)) {
            return res.status(401).json({ error: 'Unauthorized', errorCode: API_ERROR_CODES.MISSING_TOKEN });
        }

        // Ownership binding: if the body names a code (bare or eclaw:<code>), it
        // MUST equal the verified caller's own code. We always write under `code`.
        const rawClaimed: unknown = req.body.publicCode ?? req.body.proxy_end_user_id;
        if (typeof rawClaimed === 'string' && rawClaimed.length > 0) {
            const claimed = rawClaimed.toLowerCase().startsWith(ECLAW_PUBLIC_CODE_PREFIX)
                ? parseEclawPublicCode(rawClaimed)
                : (/^[a-z0-9]{6}$/.test(rawClaimed.trim().toLowerCase()) ? rawClaimed.trim().toLowerCase() : null);
            if (claimed && claimed !== code) {
                return res.status(403).json({
                    error: 'Cannot write a listing under a public code you do not control',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
        }

        const { wishlistId, name, notes, itemId } = req.body;

        if (!name || typeof name !== 'string' || name.length > 200) {
            return res.status(400).json({ error: 'A valid name (Max 200) is required', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        if (notes && String(notes).length > 1000) {
            return res.status(400).json({ error: 'Notes too long (Max 1000)', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }

        // Validate price (String? column — store numeric-as-string like createItem).
        let validatedPrice: string | null = null;
        if (req.body.price !== undefined && req.body.price !== null && req.body.price !== '') {
            if (isNaN(Number(req.body.price))) {
                return res.status(400).json({ error: 'Price must be a number', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            validatedPrice = String(req.body.price);
        }

        const proxyId = `${ECLAW_PUBLIC_CODE_PREFIX}${code}`;

        // UPDATE path: itemId must exist AND already belong to this verified code.
        if (itemId !== undefined && itemId !== null) {
            if (isNaN(Number(itemId))) {
                return res.status(400).json({ error: 'Invalid itemId', errorCode: API_ERROR_CODES.INVALID_INPUT });
            }
            const existing = await prisma.item.findUnique({ where: { id: Number(itemId) } });
            if (!existing) {
                return res.status(404).json({ error: 'Item not found', errorCode: API_ERROR_CODES.ITEM_NOT_FOUND });
            }
            if (existing.proxy_end_user_id !== proxyId) {
                return res.status(403).json({
                    error: 'Item does not belong to this EClaw public code',
                    errorCode: API_ERROR_CODES.ACCESS_DENIED,
                });
            }
            const updated = await prisma.item.update({
                where: { id: Number(itemId) },
                data: {
                    name,
                    notes: notes ?? existing.notes,
                    ...(validatedPrice !== null ? { price: validatedPrice } : {}),
                },
                select: { id: true, name: true, price: true, notes: true, wishlistId: true, createdAt: true },
            });
            return res.json({ upserted: 'updated', seller: code, item: updated });
        }

        // CREATE path: need a wishlist to attach to.
        if (wishlistId === undefined || isNaN(Number(wishlistId))) {
            return res.status(400).json({ error: 'A valid wishlistId is required to create a listing', errorCode: API_ERROR_CODES.INVALID_INPUT });
        }
        const wishlist = await prisma.wishlist.findUnique({ where: { id: Number(wishlistId) } });
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found', errorCode: API_ERROR_CODES.WISHLIST_NOT_FOUND });
        }

        const created = await prisma.item.create({
            data: {
                name,
                wishlistId: Number(wishlistId),
                notes: notes ?? null,
                price: validatedPrice,
                imageUrl: 'https://ui-avatars.com/api/?name=Item&background=random',
                uploadStatus: 'COMPLETED',
                aiStatus: 'SKIPPED',
                proxy_end_user_id: proxyId,
            },
            select: { id: true, name: true, price: true, notes: true, wishlistId: true, createdAt: true },
        });
        return res.status(201).json({ upserted: 'created', seller: code, item: created });
    } catch (error) {
        console.error('Upsert EClaw Listing Error:', error);
        res.status(500).json({ error: 'Internal server error', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};
