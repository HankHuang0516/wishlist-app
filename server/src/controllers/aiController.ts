import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';

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

// Analyze text feedback
export const analyzeText = async (text: string, language: string = 'traditional chinese') => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here") return "Mock AI Analysis: Feedback received (AI disabled)";

    try {
        const prompt = `
            Act as a polite and helpful customer support assistant for "Wishlist.ai".
            The user has submitted the following text (Question or Feedback):
            "${text}"
            
            Current Language: ${language}.
            
            Instructions:
            1. If the user is asking a "How-to" question about the app, provide a clear, step-by-step answer.
            2. If the user is reporting a bug, apologize for the inconvenience and assure them it has been recorded for the team.
            3. If the user is giving a suggestion, thank them warmly.
            4. DO NOT generate technical TODO lists, bug reports, or developer jargon.
            5. Keep the response friendly, concise, and helpful to a non-technical user.
            
            Reply ONLY in ${language}.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error analyzing text:', error);
        return "AI Analysis Failed";
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

export const extractItemDetails = async (req: Request, res: Response) => {
    res.status(501).json({ error: 'Deprecated. Use image analysis.' });
};
