
import * as cheerio from 'cheerio';

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

interface Result {
    Site: string;
    Status: number;
    Time: string;
    Title: string;
    DirectImage: boolean;
    Blocked: boolean;
}

async function testCrawler() {
    console.log("=== E-Commerce Crawler Resilience Test ===");
    const results: Result[] = [];

    for (const target of targets) {
        // console.log(`Testing ${target.name}...`);
        try {
            const start = Date.now();
            const res = await fetch(target.url, { headers: getRandomHeaders() });
            const html = await res.text();
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

        } catch (e: any) {
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
}

testCrawler();
