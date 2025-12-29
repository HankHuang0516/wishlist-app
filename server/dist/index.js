"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const wishlistRoutes_1 = __importDefault(require("./routes/wishlistRoutes"));
const aiRoutes_1 = __importDefault(require("./routes/aiRoutes"));
const socialRoutes_1 = __importDefault(require("./routes/socialRoutes"));
const itemRoutes_1 = __importDefault(require("./routes/itemRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const feedbackRoutes_1 = __importDefault(require("./routes/feedbackRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', authRoutes_1.default);
app.use('/api/wishlists', wishlistRoutes_1.default);
app.use('/api/items', itemRoutes_1.default);
app.use('/api/ai', aiRoutes_1.default);
app.use('/api/users', socialRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/feedback', feedbackRoutes_1.default);
app.use('/api/payment', paymentRoutes_1.default);
app.use('/uploads', express_1.default.static('public/uploads'));
// Serve static files from the client build directory
const clientBuildPath = path_1.default.join(__dirname, '../../client/dist');
app.use(express_1.default.static(clientBuildPath));
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(clientBuildPath, 'index.html'));
});
app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
