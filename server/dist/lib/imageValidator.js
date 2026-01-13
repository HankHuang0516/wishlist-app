"use strict";
/**
 * Image Validator Library
 * Validates if an image URL is publicly accessible (not blocked by FB/IG, 403, 404, etc.)
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
exports.isImageAccessible = exports.validateImageUrl = void 0;
const axios_1 = __importDefault(require("axios"));
// Common browser User-Agent to avoid bot detection
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
// Known blocked domains that won't display images properly (server-side blocks)
const BLOCKED_DOMAINS = [
    'fbsbx.com',
    'fbcdn.net',
    'instagram.com',
    'cdninstagram.com',
    'scontent.cdninstagram.com'
];
/**
 * Validates if an image URL is publicly accessible.
 * @param url The image URL to validate
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Validation result with status and content type
 */
const validateImageUrl = (url_1, ...args_1) => __awaiter(void 0, [url_1, ...args_1], void 0, function* (url, timeoutMs = 5000) {
    var _a;
    // Quick domain check before making request
    for (const domain of BLOCKED_DOMAINS) {
        if (url.includes(domain)) {
            return {
                valid: false,
                blockedDomain: true,
                error: `Blocked domain: ${domain}`
            };
        }
    }
    try {
        const response = yield axios_1.default.get(url, {
            timeout: timeoutMs,
            responseType: 'stream',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
            },
            validateStatus: (status) => status >= 200 && status < 400 // Accept 2xx and 3xx
        });
        const contentType = response.headers['content-type'] || '';
        // Check if it's an image
        if (contentType.startsWith('image/')) {
            // Destroy stream to stop download
            response.data.destroy();
            return {
                valid: true,
                contentType,
                statusCode: response.status
            };
        }
        response.data.destroy();
        return {
            valid: false,
            contentType,
            statusCode: response.status,
            error: `Not an image: ${contentType}`
        };
    }
    catch (error) {
        const statusCode = (_a = error.response) === null || _a === void 0 ? void 0 : _a.status;
        return {
            valid: false,
            statusCode,
            error: error.code || error.message || 'Unknown error'
        };
    }
});
exports.validateImageUrl = validateImageUrl;
/**
 * Simple boolean check for backward compatibility.
 * Replaces the old isImageAccessible function.
 */
const isImageAccessible = (url) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, exports.validateImageUrl)(url);
    return result.valid;
});
exports.isImageAccessible = isImageAccessible;
