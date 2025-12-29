"use strict";
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
exports.extractItemDetails = exports.analyzeImage = exports.analyzeText = exports.analyzeLocalImage = void 0;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Initialize Gemini
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
// Helper to convert buffer to generative part
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}
const analyzeLocalImage = (file_1, ...args_1) => __awaiter(void 0, [file_1, ...args_1], void 0, function* (file, language = 'traditional chinese') {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("DEBUG: API Key present?", !!apiKey, "Key length:", apiKey === null || apiKey === void 0 ? void 0 : apiKey.length);
    if (!apiKey || apiKey === "your_api_key_here") {
        console.warn("GEMINI_API_KEY missing, using mock response");
        return yield mockAnalyzeImage(file.originalname);
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
    const result = yield model.generateContent([prompt, imagePart]);
    const response = yield result.response;
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
    }
    catch (e) {
        console.error("Failed to parse Gemini JSON:", text);
        throw new Error("AI response format error");
    }
});
exports.analyzeLocalImage = analyzeLocalImage;
// Analyze text feedback
const analyzeText = (text_1, ...args_1) => __awaiter(void 0, [text_1, ...args_1], void 0, function* (text, language = 'traditional chinese') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here")
        return "Mock AI Analysis: Feedback received (AI disabled)";
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
        const result = yield model.generateContent(prompt);
        const response = yield result.response;
        return response.text();
    }
    catch (error) {
        console.error('Error analyzing text:', error);
        return "AI Analysis Failed";
    }
});
exports.analyzeText = analyzeText;
const analyzeImage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image file is required' });
        }
        const language = req.body.language || 'Traditional Chinese';
        const data = yield (0, exports.analyzeLocalImage)({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname
        }, language);
        res.json(data);
    }
    catch (error) {
        console.error('AI Analysis error:', error);
        // Fallback to mock if API fails (e.g. quota exceeded)
        console.log("Falling back to mock response due to error.");
        res.json(yield mockAnalyzeImage(((_a = req.file) === null || _a === void 0 ? void 0 : _a.originalname) || "unknown"));
    }
});
exports.analyzeImage = analyzeImage;
// Mock function kept as fallback
const mockAnalyzeImage = (filename) => __awaiter(void 0, void 0, void 0, function* () {
    yield new Promise(resolve => setTimeout(resolve, 1500));
    return {
        name: "Mock Analysis: Nike Air Zoom Pegasus 39",
        price: "120.00",
        currency: "USD",
        tags: ["shoes", "running", "nike", "mock"],
        shoppingLink: "https://www.google.com/search?q=Nike+Air+Zoom+Pegasus+39&tbm=shop",
        description: "This is a mock response because the API Key is missing or invalid."
    };
});
const extractItemDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(501).json({ error: 'Deprecated. Use image analysis.' });
});
exports.extractItemDetails = extractItemDetails;
