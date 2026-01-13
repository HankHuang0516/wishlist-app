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
const aiController_1 = require("./controllers/aiController");
dotenv_1.default.config();
function testRealAi() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Testing analyzeProductText with specific Shopee URL...");
        const url = "https://shopee.tw/product/272447805/7843986428?gads_t_sig=VTJGc2RHVmtYMTlxTFVSVVRrdENkV083Sk9aTHUvR0kxd1pwOWlVL0grVUl5Y216Y1hySFV0RlZ0aE5ZaXBhWTJTTk41L2FaRXN4VjBNVTFnNlQ2ZWs3STlYL3ZPWWVmRGxxS1dpMG1xYXVMbXpZTTJyZldyazFZRzM2NWl0OEQ";
        // Simulate what processUrlAi does: detects soft block, parses IDs, then calls processTextAi -> analyzeProductText
        // In processTextAi, it might pass searchContext if it used the OLD logic.
        // BUT with the NEW logic, analyzeProductText should do the searching itself if searchContext is null.
        // Let's test providing just the URL, forcing Gemini to use its tool.
        try {
            const start = Date.now();
            const result = yield (0, aiController_1.analyzeProductText)(url, 'Traditional Chinese');
            const end = Date.now();
            console.log("Analysis Result:", JSON.stringify(result, null, 2));
            console.log(`Duration: ${(end - start) / 1000}s`);
            if (result.name && (result.name.includes("Mario") || result.name.includes("瑪利歐"))) {
                console.log("✅ SUCCESS: Found Mario!");
            }
            else {
                console.log("❌ FAILURE: Did not find Mario.");
            }
        }
        catch (e) {
            console.error("❌ ERROR:", e);
        }
    });
}
testRealAi();
