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
exports.extractItemDetails = exports.analyzeTextHandler = exports.analyzeImage = exports.analyzeText = exports.analyzeProductText = exports.analyzeLocalImage = void 0;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
const analyzeProductText = (productName_1, ...args_1) => __awaiter(void 0, [productName_1, ...args_1], void 0, function* (productName, language = 'traditional chinese') {
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
    const prompt = `
        User wants to add a product to their wishlist by name: "${productName}".
        Act as a shopping assistant. Infer the details of this product.
        Language: ${language}.
        
        Return JSON object with:
        1. name: Refined product name (keep user's intent but make it official if clear).
        2. price: Estimated price (number only).
        3. currency: ISO currency code.
        4. tags: 3-5 keywords.
        5. shoppingLink: A generic search URL for this product on Google Shopping.
        6. description: Brief attractiveness description (1-2 sentences).
        7. imageUrl: A representative product image URL (must be a valid direct image URL, e.g. ending in .jpg or .png, from a major retailer or manufacturer if possible).
        
        Return ONLY JSON.
    `;
    const result = yield model.generateContent(prompt);
    const response = yield result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const data = JSON.parse(jsonStr);
        // Ensure shopping link exists
        data.shoppingLink = `https://www.google.com/search?q=${encodeURIComponent(data.name || productName)}&tbm=shop`;
        return data;
    }
    catch (e) {
        console.error("Failed to parse Gemini Product JSON:", text);
        return {
            name: productName,
            description: "Could not retrieve details via AI.",
            shoppingLink: `https://www.google.com/search?q=${encodeURIComponent(productName)}`
        };
    }
});
exports.analyzeProductText = analyzeProductText;
// Analyze text feedback
const analyzeText = (text_1, ...args_1) => __awaiter(void 0, [text_1, ...args_1], void 0, function* (text, language = 'traditional chinese') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_api_key_here")
        return "Mock AI Analysis: Feedback received (AI disabled)";
    try {
        // Load FAQ context
        let faqContent = "";
        try {
            const faqPath = path_1.default.join(__dirname, '../data/FAQ.md');
            if (fs_1.default.existsSync(faqPath)) {
                faqContent = fs_1.default.readFileSync(faqPath, 'utf-8');
            }
        }
        catch (e) {
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
        const result = yield model.generateContent(prompt);
        const response = yield result.response;
        return response.text();
    }
    catch (error) {
        console.error('Error analyzing text:', error);
        return "AI Analysis Failed (AI 分析失敗，請稍後再試)";
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
// Route handler for text analysis
const analyzeTextHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { text, language } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        const responseText = yield (0, exports.analyzeText)(text, language);
        res.json({ response: responseText });
    }
    catch (error) {
        console.error('AI Text Analysis Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
exports.analyzeTextHandler = analyzeTextHandler;
const extractItemDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(501).json({ error: 'Deprecated. Use image analysis.' });
});
exports.extractItemDetails = extractItemDetails;
