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
exports.fetchOpenGraphData = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
/**
 * Fetches Open Graph metadata from a given URL.
 * Optimized for performance with a short timeout to avoid blocking user interactions.
 */
const fetchOpenGraphData = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Enforce a strict timeout to prevent slow responses from blocking the AI flow
        // Standard headers to mimic a browser/bot to avoid basic 403s
        const response = yield axios_1.default.get(url, {
            timeout: 4000, // 4 seconds max
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; WishlistAI-Bot/1.0; +https://wishlist-app-production.up.railway.app/)'
            },
            maxRedirects: 3
        });
        const html = response.data;
        const $ = cheerio.load(html);
        const getMeta = (property) => {
            return $(`meta[property="${property}"]`).attr('content') ||
                $(`meta[name="${property}"]`).attr('content') ||
                null;
        };
        const data = {
            title: getMeta('og:title') || $('title').text() || null,
            description: getMeta('og:description') || getMeta('description') || null,
            image: getMeta('og:image'),
            site_name: getMeta('og:site_name'),
            url: getMeta('og:url') || url,
            price: {
                amount: getMeta('product:price:amount') || getMeta('og:price:amount'),
                currency: getMeta('product:price:currency') || getMeta('og:price:currency')
            },
            success: true
        };
        // Heuristics: If we don't have a title or image, consider it a partial/failed fetch
        // effectively meaning we might still need reliable search data
        if (!data.title && !data.image) {
            return Object.assign(Object.assign({}, data), { success: false });
        }
        return data;
    }
    catch (error) {
        console.warn(`[OpenGraph] Failed to fetch OG data for ${url}:`, error.message);
        return {
            title: null,
            description: null,
            image: null,
            site_name: null,
            url: null,
            success: false
        };
    }
});
exports.fetchOpenGraphData = fetchOpenGraphData;
