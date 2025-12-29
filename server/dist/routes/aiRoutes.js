"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const aiController_1 = require("../controllers/aiController");
const router = express_1.default.Router();
// Configure multer for memory storage (or disk storage if preferred)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
router.use(auth_1.authenticateToken);
router.post('/analyze-image', upload.single('image'), aiController_1.analyzeImage);
exports.default = router;
