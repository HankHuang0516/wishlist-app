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
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const feedbackController_1 = require("../controllers/feedbackController");
const emailService_1 = require("../lib/emailService");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.post('/', feedbackController_1.createFeedback);
// Debug Route: Test Email (Auth Required)
router.post('/test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Debug] Manual Email Test Triggered');
        const result = yield (0, emailService_1.sendEmail)('hankhuang0516@gmail.com', 'Live Debug Test Email', '<p>This is a manual test triggered from Settings Page. <br>System Status: <b>Online</b></p>');
        res.json(result);
    }
    catch (error) {
        console.error('[Debug] Manual Email Test Failed:', error);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
}));
exports.default = router;
