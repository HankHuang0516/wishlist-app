/**
 * Image Validator Library
 * Validates if an image URL is publicly accessible (not blocked by FB/IG, 403, 404, etc.)
 */

import axios from 'axios';

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

export interface ImageValidationResult {
    valid: boolean;
    contentType?: string;
    statusCode?: number;
    error?: string;
    blockedDomain?: boolean;
}

/**
 * Validates if an image URL is publicly accessible.
 * @param url The image URL to validate
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Validation result with status and content type
 */
export const validateImageUrl = async (url: string, timeoutMs: number = 5000): Promise<ImageValidationResult> => {
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
        const response = await axios.get(url, {
            timeout: timeoutMs,
            responseType: 'stream',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
            },
            validateStatus: (status: number) => status >= 200 && status < 400 // Accept 2xx and 3xx
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

    } catch (error: any) {
        const statusCode = error.response?.status;
        return {
            valid: false,
            statusCode,
            error: error.code || error.message || 'Unknown error'
        };
    }
};

/**
 * Simple boolean check for backward compatibility.
 * Replaces the old isImageAccessible function.
 */
export const isImageAccessible = async (url: string): Promise<boolean> => {
    const result = await validateImageUrl(url);
    return result.valid;
};
