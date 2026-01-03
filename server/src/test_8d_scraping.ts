/**
 * 8D Investigation Script: Production Scraping Difference
 * Purpose: Identify why Momo URL works locally but fails on production
 */

import * as cheerio from 'cheerio';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getHeaders = (referer: string = 'https://www.google.com/') => ({
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': referer,
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
});

interface TestResult {
    site: string;
    url: string;
    status: number;
    title: string;
    hasOgImage: boolean;
    hasOgTitle: boolean;
    blocked: boolean;
    errorMsg: string | null;
}

const testUrls = [
    {
        site: 'Momo',
        url: 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558'
    },
    {
        site: 'PChome',
        url: 'https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX'
    },
    {
        site: 'Yahoo',
        url: 'https://tw.buy.yahoo.com/gdsale/gdsale.asp?gdid=7872232'
    },
    {
        site: 'Books',
        url: 'https://www.books.com.tw/products/N001882999'
    }
];

async function testScraping(site: string, url: string): Promise<TestResult> {
    const result: TestResult = {
        site,
        url: url.substring(0, 50) + '...',
        status: 0,
        title: '',
        hasOgImage: false,
        hasOgTitle: false,
        blocked: false,
        errorMsg: null
    };

    try {
        const start = Date.now();
        const response = await fetch(url, {
            headers: getHeaders(),
            redirect: 'follow'
        });
        result.status = response.status;

        if (!response.ok) {
            result.blocked = true;
            result.errorMsg = `HTTP ${response.status}`;
            return result;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract metadata
        result.title = $('title').text().trim().substring(0, 40);
        result.hasOgImage = !!$('meta[property="og:image"]').attr('content');
        result.hasOgTitle = !!$('meta[property="og:title"]').attr('content');

        // Detect soft blocks
        const lowerTitle = result.title.toLowerCase();
        const lowerHtml = html.toLowerCase();

        if (lowerTitle.includes('robot') ||
            lowerTitle.includes('captcha') ||
            lowerTitle.includes('verify') ||
            lowerTitle.includes('access denied') ||
            lowerHtml.includes('captcha') ||
            lowerHtml.includes('cf-browser-verification')) {
            result.blocked = true;
            result.errorMsg = 'Soft block detected (captcha/robot check)';
        }

        // Check for empty/suspicious content
        if (!result.hasOgImage && !result.hasOgTitle && $('img').length < 3) {
            result.blocked = true;
            result.errorMsg = 'Suspicious: No OG tags and minimal images';
        }

        console.log(`[${site}] Done in ${Date.now() - start}ms`);

    } catch (e: any) {
        result.status = 0;
        result.blocked = true;
        result.errorMsg = e.message;
    }

    return result;
}

async function main() {
    console.log('='.repeat(60));
    console.log('8D INVESTIGATION: E-Commerce Scraping Test');
    console.log('Environment:', process.env.RAILWAY_ENVIRONMENT || 'LOCAL');
    console.log('Node Version:', process.version);
    console.log('='.repeat(60));
    console.log('');

    const results: TestResult[] = [];

    for (const { site, url } of testUrls) {
        console.log(`Testing ${site}...`);
        const result = await testScraping(site, url);
        results.push(result);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(60));

    console.table(results.map(r => ({
        Site: r.site,
        Status: r.status,
        Title: r.title.substring(0, 25) + (r.title.length > 25 ? '...' : ''),
        OgImage: r.hasOgImage ? '✓' : '✗',
        OgTitle: r.hasOgTitle ? '✓' : '✗',
        Blocked: r.blocked ? '❌ YES' : '✅ NO',
        Error: r.errorMsg || '-'
    })));

    // Summary
    const blocked = results.filter(r => r.blocked);
    console.log('');
    console.log(`Total: ${results.length} sites tested`);
    console.log(`Blocked: ${blocked.length} (${blocked.map(b => b.site).join(', ') || 'None'})`);
    console.log(`Success: ${results.length - blocked.length}`);
}

main();
