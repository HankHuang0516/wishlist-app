"use strict";
/**
 * 8D Investigation: Momo Specific Analysis
 * Purpose: Understand exactly what Momo returns and verify AI fallback works
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = __importStar(require("cheerio"));
const MOMO_URL = 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558';
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com/',
    'Cache-Control': 'no-cache',
});
function debugMomo() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('='.repeat(60));
        console.log('MOMO DETAILED ANALYSIS');
        console.log('='.repeat(60));
        console.log('');
        console.log('URL:', MOMO_URL);
        console.log('');
        try {
            const response = yield fetch(MOMO_URL, { headers: getHeaders() });
            console.log('--- HTTP Response ---');
            console.log('Status:', response.status);
            console.log('Status Text:', response.statusText);
            console.log('Headers:');
            response.headers.forEach((value, key) => {
                if (['content-type', 'set-cookie', 'x-frame-options', 'content-security-policy'].includes(key.toLowerCase())) {
                    console.log(`  ${key}: ${value.substring(0, 80)}...`);
                }
            });
            console.log('');
            const html = yield response.text();
            const $ = cheerio.load(html);
            console.log('--- Page Content Analysis ---');
            console.log('HTML Length:', html.length, 'bytes');
            console.log('Title:', $('title').text().trim());
            console.log('');
            console.log('--- OG Meta Tags ---');
            console.log('og:title:', $('meta[property="og:title"]').attr('content') || 'NOT FOUND');
            console.log('og:image:', $('meta[property="og:image"]').attr('content') || 'NOT FOUND');
            console.log('og:description:', ($('meta[property="og:description"]').attr('content') || 'NOT FOUND').substring(0, 50));
            console.log('');
            console.log('--- Blocking Indicators ---');
            const lowerHtml = html.toLowerCase();
            console.log('Contains "captcha":', lowerHtml.includes('captcha'));
            console.log('Contains "robot":', lowerHtml.includes('robot'));
            console.log('Contains "verify":', lowerHtml.includes('verify'));
            console.log('Contains "cloudflare":', lowerHtml.includes('cloudflare'));
            console.log('Contains "challenge":', lowerHtml.includes('challenge'));
            console.log('');
            console.log('--- Image Count ---');
            console.log('Total <img> tags:', $('img').length);
            console.log('');
            // Check if it's a redirect/soft block
            if (html.length < 5000) {
                console.log('⚠️ WARNING: Very short HTML response - likely blocked or redirected');
                console.log('First 500 chars of HTML:');
                console.log(html.substring(0, 500));
            }
            else if ($('meta[property="og:image"]').attr('content')) {
                console.log('✅ LOOKS OK: OG image found, content appears loaded');
            }
            else {
                console.log('⚠️ WARNING: No OG image but HTML is long - possible JS-rendered page');
            }
        }
        catch (e) {
            console.log('❌ FETCH ERROR:', e.message);
        }
    });
}
debugMomo();
