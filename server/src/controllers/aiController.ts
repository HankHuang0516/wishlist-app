import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

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

// Helper: Google Custom Search for Image
const searchGoogleImage = async (query: string): Promise<string | null> => {
    const cseId = process.env.GOOGLE_CSE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!cseId || !apiKey) {
        console.warn("Google CSE keys missing. Skipping image search.");
        return null; // Fallback to Gemini hallucination (or random)
    }

    try {
        const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${cseId}&key=${apiKey}&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active`;
        const axios = require('axios');
        const res = await axios.get(url);

        if (res.data.items && res.data.items.length > 0) {
            console.log("Found Google Image:", res.data.items[0].link);
            return res.data.items[0].link;
        }
        return null;
    } catch (error) {
        console.error("Google Image Search failed:", error);
        return null;
    }
};

export const analyzeProductText = async (productName: string, language: string = 'traditional chinese') => {
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

    // 1. Try to find a real image using Google Search (if configured)
    const googleImage = await searchGoogleImage(productName);

    // 2. Ask Gemini for details + (optional) image url if google failed
    const prompt = `
        User wants to add a product to their wishlist.
        Input: "${productName}"
        
        The input might be a specific **Product Name** OR a **Product URL**.
        
        Act as a shopping assistant. Infer the details of this product.
        Language: ${language}.
        
        Instructions:
        - If input is a URL, extract/guess the product details from the URL structure or potential content.
        - If input is a Name, search/infer details normally.
        
        Return JSON object with:
        1. name: Refined product name (keep user's intent but make it official if clear).
        2. price: Estimated price (number only).
        3. currency: ISO currency code.
        4. tags: 3-5 keywords.
        5. shoppingLink: A generic search URL for this product on Google Shopping.
        6. description: Brief attractiveness description (1-2 sentences).
        7. imageUrl: ${googleImage ? 'IGNORE THIS FIELD (Use provided)' : 'A representative product image URL (Must be a direct link to JPG/PNG from a public site like Wikimedia, Manufacturer, or major CDN. Avoid retailer links that valid anti-bot/403). If unsure, leave null.'}
        
        Return ONLY JSON.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const data = JSON.parse(jsonStr);
        // Ensure shopping link exists
        data.shoppingLink = `https://www.google.com/search?q=${encodeURIComponent(data.name || productName)}&tbm=shop`;

        // Use Google Image if found, otherwise keep Gemini's or null
        if (googleImage) {
            data.imageUrl = googleImage;
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
