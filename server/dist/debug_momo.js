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
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const aiController_1 = require("./controllers/aiController");
// Load .env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const debugMomo = () => __awaiter(void 0, void 0, void 0, function* () {
    const url = "https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558&osm=Ad07";
    // SIMPLIFIED QUERY: Natural language instead of "site:" operator
    const suggestedQuery = "momoshop product 14244558";
    console.log("Debugging Momo AI Processing (Natural Query)...");
    console.log("Input URL:", url);
    console.log("Suggested Query:", suggestedQuery);
    try {
        const result = yield (0, aiController_1.analyzeProductText)(url, 'traditional chinese', null, suggestedQuery);
        console.log("\n✅ Extracted Name:", result.name);
        console.log("✅ Extracted Image:", result.imageUrl);
    }
    catch (error) {
        console.error("\n❌ Error:", error);
    }
});
debugMomo();
