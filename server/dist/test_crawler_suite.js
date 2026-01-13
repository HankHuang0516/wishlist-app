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
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = __importStar(require("cheerio"));
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];
const getRandomHeaders = () => {
    return {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    };
};
const targets = [
    { name: "Momo (Desktop)", url: "https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=10201991" },
    { name: "PChome", url: "https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX" },
    { name: "Yahoo", url: "https://tw.buy.yahoo.com/gdsale/gdsale.asp?gdid=7872232" },
    { name: "Books", url: "https://www.books.com.tw/products/N001882999" }
];
function testCrawler() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("=== E-Commerce Crawler Resilience Test ===");
        const results = [];
        for (const target of targets) {
            // console.log(`Testing ${target.name}...`);
            try {
                const start = Date.now();
                const res = yield fetch(target.url, { headers: getRandomHeaders() });
                const html = yield res.text();
                const duration = Date.now() - start;
                const $ = cheerio.load(html);
                const title = $('title').text().trim().substring(0, 30); // Truncate title
                const lowerTitle = title.toLowerCase();
                const isSoftBlock = lowerTitle.includes('robot') ||
                    lowerTitle.includes('verify') ||
                    lowerTitle.includes('access denied');
                const ogImage = $('meta[property="og:image"]').attr('content');
                const hasImages = $('img').length > 5;
                results.push({
                    Site: target.name,
                    Status: res.status,
                    Time: `${duration}ms`,
                    Title: isSoftBlock ? "SOFT BLOCK" : (title || "No Title"),
                    DirectImage: !!(ogImage || hasImages),
                    Blocked: isSoftBlock || res.status === 403
                });
            }
            catch (e) {
                results.push({
                    Site: target.name,
                    Status: 0,
                    Time: "0ms",
                    Title: `Error: ${e.message}`.substring(0, 30),
                    DirectImage: false,
                    Blocked: true
                });
            }
        }
        console.table(results);
    });
}
testCrawler();
