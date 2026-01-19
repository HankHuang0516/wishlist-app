import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    tools: [
        // @ts-ignore
        { googleSearch: {} }
    ]
});

// Helper to convert buffer to generative part
function fileToGenerativePart(buffer: Buffer, mimeType: string) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

export const analyzeLocalImage = async (file: { buffer: Buffer, mimetype: string, originalname: string }, language: string = 'traditional chinese') => {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("DEBUG: API Key present?", !!apiKey, "Key length:", apiKey?.length);

    if (!apiKey || apiKey === "your_api_key_here") {
        console.warn("GEMINI_API_KEY missing, using mock response");
        return await mockAnalyzeImage(file.originalname);
    }

    console.log(`Analyzing image with Gemini: ${file.originalname}, Language: ${language}`);

    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);

    const prompt = `
        Analyze this product image and extract the following details in JSON format.
        The user's preferred language is: ${language}.
        
        1. name: Specific product name (brand and model) in ${language}.
        2. price: Estimated price (number only).
        3. currency: ISO currency code (e.g., TWD, USD, JPY). Default to local currency for ${language}.
        4. tags: A list of 3-5 relevant tags in ${language}.
        5. shoppingLink: A generic search URL for this product on Google Shopping.
        6. description: A brief, attractive description (max 2 sentences) in ${language}.
        
        Return ONLY the JSON object, no markdown formatting.
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Clean up markdown if present
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const data = JSON.parse(jsonStr);

        // Enhance with shopping link if simple search
        if (!data.shoppingLink || data.shoppingLink.includes("search")) {
            data.shoppingLink = `https://www.google.com/search?q=${encodeURIComponent(data.name)}&tbm=shop`;
        }

        return data;
    } catch (e) {
        console.error("Failed to parse Gemini JSON:", text);
        throw new Error("AI response format error");
    }
};

// Helper: Validate if image is accessible (delegated to lib)
import { isImageAccessible, validateImageUrl } from '../lib/imageValidator';
import { fetchOpenGraphData, OpenGraphData } from '../lib/openGraphScraper';
export { isImageAccessible, validateImageUrl };


// Helper: Google Custom Search for Image
const searchGoogleImage = async (query: string): Promise<string | null> => {
    const cseId = process.env.GOOGLE_CSE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!cseId || !apiKey) {
        console.warn("Google CSE keys missing. Skipping image search.");
        return null; // Fallback to Gemini hallucination (or random)
    }

    try {
        // -site:facebook.com -site:instagram.com to exclude social media noise
        // Search for more items (num=5) to have a pool for validation
        const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${cseId}&key=${apiKey}&q=${encodeURIComponent(query + " -site:facebook.com -site:instagram.com")}&searchType=image&num=5&safe=active`;
        const axios = require('axios');
        const res = await axios.get(url);

        if (res.data.items && res.data.items.length > 0) {
            console.log(`[ImageSearch] Found ${res.data.items.length} candidates. Validating...`);

            // Iterate through items to find the first ACCESSIBLE one
            for (const item of res.data.items) {
                const link = item.link || '';

                // 1. Static Filter (Exclude known bad domains)
                if (link.includes('fbsbx.com') || link.includes('facebook.com') || link.includes('instagram.com')) {
                    continue;
                }

                // 2. Dynamic Validation (Check if URL is alive)
                const isValid = await isImageAccessible(link);
                if (isValid) {
                    console.log("✅ Found Valid Google Image:", link);
                    return link;
                } else {
                    console.log("⚠️ Skipping inaccessible image:", link);
                }
            }
            console.warn("❌ No valid accessible images found in search results.");
        }
        return null;
    } catch (error) {
        console.error("Google Image Search failed:", error);
        return null;
    }
};


// Helper: Google Custom Search for Web (JSON)
export const searchGoogleWeb = async (query: string): Promise<{ title: string, snippet: string, link: string } | null> => {
    const cseId = process.env.GOOGLE_CSE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!cseId || !apiKey) {
        console.warn("Google CSE keys missing. Skipping web search.");
        return null;
    }

    try {
        // Without searchType=image, it defaults to web
        const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${cseId}&key=${apiKey}&q=${encodeURIComponent(query)}&num=1&safe=active`;
        const axios = require('axios'); // Ensure axios is available or use fetch
        const res = await axios.get(url);

        if (res.data.items && res.data.items.length > 0) {
            const item = res.data.items[0];
            console.log("Found Google Web Result:", item.title);
            return {
                title: item.title,
                snippet: item.snippet,
                link: item.link
            };
        }
        return null; // No results
    } catch (error: any) {
        console.error("Google Web Search failed:", error?.message || error);
        return null;
    }
};

export const analyzeProductText = async (productName: string, language: string = 'traditional chinese', searchContext: any = null, suggestedSearchQuery: string | null = null) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here") {
        return {
            name: productName,
            price: "100",
            currency: "USD",
            tags: ["manual", "search"],
            imageUrl: null,
            shoppingLink: `https://www.google.com/search?q=${encodeURIComponent(productName)}`,
            description: "Mock description for " + productName
        };
    }

    // Cost Optimization: Open Graph Check
    // If input looks like a URL, try to fetch OG data first.
    // If successful, we can SKIP the expensive Google Search.
    const isUrl = productName.startsWith('http://') || productName.startsWith('https://');
    let ogData: OpenGraphData | null = null;
    let skipGoogleSearch = false; // Flag to skip Google Search if OG is good enough

    if (isUrl) {
        console.log(`[CostOptimization] Input is URL, attempting Open Graph fetch: ${productName}`);
        ogData = await fetchOpenGraphData(productName);

        if (ogData.success && ogData.title && ogData.image) {
            console.log(`[CostOptimization] ✅ OG Data Found! Title: "${ogData.title}", Image: Yes`);
            // We have a title and an image, we can likely skip Google Image Search
            skipGoogleSearch = true;
        } else {
            console.log(`[CostOptimization] ⚠️ OG Data incomplete or failed. Falling back to Google Search.`);
        }
    }

    // 1. Try to find a real image using Google Search (if configured AND NOT SKIPPED)
    // Only search image if we didn't get a confirmed link from searchContext OR OG data
    let googleImage = null;

    // If we have OG Image, use it directly
    if (ogData?.image) {
        googleImage = ogData.image;
        console.log(`[CostOptimization] Using Open Graph Image: ${googleImage}`);
    }
    // Otherwise, check searchContext or do Google Search
    else if (!searchContext || !searchContext.imageUrl) {
        // Only run Google Search if we didn't explicitly decide to skip it
        if (!skipGoogleSearch) {
            // If input is a raw URL and OG failed, we might want to search for the URL itself or do nothing?
            // Actually, if it's a URL, searching for the URL in Google Images isn't great.
            // But existing logic did: searchGoogleImage(searchContext?.title || productName)
            // If productName is URL, this searches the URL string in Image Search.
            googleImage = await searchGoogleImage(searchContext?.title || productName);
        }
    }


    // 2. Ask Gemini for details + (optional) image url if google failed
    // Incorporate Search Context or OG Data if available
    let contextStr = "";
    if (ogData && ogData.success) {
        contextStr = `
        [Source: Open Graph Metadata from URL]
        Title: "${ogData.title}"
        Description: "${ogData.description}"
        Site Name: "${ogData.site_name}"
        Detected Price: "${ogData.price?.amount || 'Unknown'} ${ogData.price?.currency || ''}"
        Original URL: "${ogData.url}"
        
        The user provided a direct link. TRUST this metadata as the primary source of truth.
        `;
    } else if (searchContext) {
        contextStr = `
        Additional Context found from Google Search:
        Title: "${searchContext.title}"
        Snippet: "${searchContext.snippet}"
        Link: "${searchContext.link}"
        `;
    }

    const prompt = `
        User wants to add a product to their wishlist.
        Input: "${productName}"
        ${contextStr}
        
        The input might be a specific **Product Name** OR a **Product URL**.
        
        ${skipGoogleSearch ?
            `####################################################################
        # COST SAVING MODE: OPEN GRAPH DATA FOUND                          #
        # DO NOT ASK FOR SEARCH. USE THE PROVIDED OG METADATA.             #
        ####################################################################`
            :
            `##########################################################
        # MANDATORY: YOU MUST USE GOOGLE SEARCH BEFORE ANSWERING #
        # (Unless detailed Context is provided via OG above)     #
        ##########################################################`
        }
        
        ${suggestedSearchQuery && !skipGoogleSearch ? `1. EXECUTE THIS EXACT SEARCH: "${suggestedSearchQuery}"
        2. Read the search results carefully.
        3. Extract the REAL product name from the search results.
        4. DO NOT GUESS or HALLUCINATE the product name. If search returns no results, say "Unknown Product".` :
            (!skipGoogleSearch ? `1. SEARCH for the input (especially if it is a URL) to find the actual product page.
        2. Read the search results to get the REAL product details.` : `1. Analyze the provided Metadata to extract product details.`)
        }
        
        IMPORTANT ANTI-HALLUCINATION RULES:
        - If the input is a Momo URL with i_code=XXXXX, the product MUST be from momoshop.com.tw
        - NEVER return a product name that doesn't match the actual search results/metadata
        - If unsure, return name as "Unknown Product from [Store Name]"
        
        Act as a shopping assistant. Language: ${language}.
        
        Instructions:
        - If "Additional Context" (OG Data) is provided, PRIORITIZE it as the source of truth.
        - If input is a URL, SEARCH for it first (unless OG data provided), then extract details from results.
        - NEVER GUESS product names - only use information from search results or metadata.
        
        Return JSON object with:
        1. name: Exact product name from search results (NOT guessed).
        2. price: Price from search results (number only). Use 0 if unknown.
        3. currency: ISO currency code (default: TWD for Taiwan stores).
        4. tags: 3-5 keywords.
        5. shoppingLink: A generic search URL for this product on Google Shopping.
        6. description: Brief description (1-2 sentences) from search results.
        7. imageUrl: ${googleImage ? 'IGNORE THIS FIELD (Use provided)' : 'Product image URL from search results. Must be direct JPG/PNG link. Leave null if unsure.'}
        
        Return ONLY valid JSON, no markdown.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const data = JSON.parse(jsonStr);
        // Ensure shopping link exists
        data.shoppingLink = `https://www.google.com/search?q=${encodeURIComponent(data.name || productName)}&tbm=shop`;

        // Use Google/OG Image if found, otherwise keep Gemini's or null
        // Double Fallback: If we didn't find an image initially (e.g. because input was a URL),
        // but now we have a proper Product Name from Gemini, try searching Image again!
        if (googleImage) {
            data.imageUrl = googleImage;
        } else if (!data.imageUrl && data.name && !skipGoogleSearch) {
            // Only do secondary search if we didn't skip search earlier
            console.log(`[AI] Initial image search failed, trying again with inferred name: "${data.name}"`);
            const secondaryImage = await searchGoogleImage(data.name);
            if (secondaryImage) {
                data.imageUrl = secondaryImage;
            }
        }

        return data;
    } catch (e) {
        console.error("Failed to parse Gemini Product JSON:", text);
        return {
            name: productName,
            description: "Could not retrieve details via AI.",
            shoppingLink: `https://www.google.com/search?q=${encodeURIComponent(productName)}`,
            imageUrl: googleImage // Fallback usage
        };
    }
};

// Analyze text feedback
export const analyzeText = async (text: string, language: string = 'traditional chinese') => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here") return "Mock AI Analysis: Feedback received (AI disabled)";

    try {
        // Load FAQ context
        let faqContent = "";
        try {
            const faqPath = path.join(__dirname, '../data/FAQ.md');
            if (fs.existsSync(faqPath)) {
                faqContent = fs.readFileSync(faqPath, 'utf-8');
            }
        } catch (e) {
            console.warn("Failed to load FAQ.md", e);
        }

        const prompt = `
            Act as a polite and helpful customer support assistant for "Wishlist.ai".
            
            Context (FAQ / User Guide):
            ${faqContent}
            
            User Question:
            "${text}"
            
            Current Language Mode: ${language}.
            
            Instructions:
            1. **Prioritize the FAQ**: If the user's question is covered by the FAQ context above, Answer strictly based on that information.
            2. **Language Strictness**: You MUST reply in ${language} (Traditional Chinese if not specified). Do not reply in English unless the user explicitly requested English.
            3. **Tone**: Be friendly, concise, and helpful. Use emojis 🌟 periodically to sound approachable.
            4. **Scope**: If the question is unrelated to the app, politely guide them back to Wishlist.ai topics.
            5. **Format**: Use clear paragraphs or bullet points.
            
            Reply ONLY in the requested language.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error analyzing text:', error);
        return "AI Analysis Failed (AI 分析失敗，請稍後再試)";
    }
};

export const analyzeImage = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image file is required' });
        }

        const language = req.body.language || 'Traditional Chinese';
        const data = await analyzeLocalImage({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname
        }, language);

        res.json(data);

    } catch (error) {
        console.error('AI Analysis error:', error);
        // Fallback to mock if API fails (e.g. quota exceeded)
        console.log("Falling back to mock response due to error.");
        res.json(await mockAnalyzeImage(req.file?.originalname || "unknown"));
    }
};

// Mock function kept as fallback
const mockAnalyzeImage = async (filename: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
        name: "Mock Analysis: Nike Air Zoom Pegasus 39",
        price: "120.00",
        currency: "USD",
        tags: ["shoes", "running", "nike", "mock"],
        shoppingLink: "https://www.google.com/search?q=Nike+Air+Zoom+Pegasus+39&tbm=shop",
        description: "This is a mock response because the API Key is missing or invalid."
    };
};

// Route handler for text analysis
export const analyzeTextHandler = async (req: Request, res: Response) => {
    try {
        const { text, language } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        const responseText = await analyzeText(text, language);
        res.json({ response: responseText });
    } catch (error) {
        console.error('AI Text Analysis Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const extractItemDetails = async (req: Request, res: Response) => {
    res.status(501).json({ error: 'Deprecated. Use image analysis.' });
};
