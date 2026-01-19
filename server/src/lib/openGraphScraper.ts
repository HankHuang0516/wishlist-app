import axios from 'axios';
import * as cheerio from 'cheerio';

export interface OpenGraphData {
    title: string | null;
    description: string | null;
    image: string | null;
    site_name: string | null;
    url: string | null;
    price?: {
        amount: string | null;
        currency: string | null;
    };
    success: boolean;
}

/**
 * Fetches Open Graph metadata from a given URL.
 * Optimized for performance with a short timeout to avoid blocking user interactions.
 */
export const fetchOpenGraphData = async (url: string): Promise<OpenGraphData> => {
    try {
        // Enforce a strict timeout to prevent slow responses from blocking the AI flow
        // Standard headers to mimic a browser/bot to avoid basic 403s
        const response = await axios.get(url, {
            timeout: 4000, // 4 seconds max
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; WishlistAI-Bot/1.0; +https://wishlist-app-production.up.railway.app/)'
            },
            maxRedirects: 3
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const getMeta = (property: string) => {
            return $(`meta[property="${property}"]`).attr('content') ||
                $(`meta[name="${property}"]`).attr('content') ||
                null;
        };

        const data: OpenGraphData = {
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
            return { ...data, success: false };
        }

        return data;

    } catch (error: any) {
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
};
