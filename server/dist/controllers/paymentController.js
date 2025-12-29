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
exports.payByPrime = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const TAPPAY_PARTNER_KEY = process.env.TAPPAY_PARTNER_KEY || 'partner_PHNbIt8d88834446583'; // Standard Sandbox Partner Key
const TAPPAY_MERCHANT_ID = process.env.TAPPAY_MERCHANT_ID || 'GlobalTesting_CTBC';
const TAPPAY_SANDBOX_URL = 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime';
const payByPrime = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { prime, details, paymentMethod } = req.body; // details: { amount, currency, orderId, ... }
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!prime || !details || !details.amount) {
            return res.status(400).json({ error: 'Missing payment information' });
        }
        // Fetch user to get phone/name
        const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        console.log(`[Payment] Processing Pay-by-Prime for User ${userId}, Amount: ${details.amount}, Method: ${paymentMethod}`);
        // Call TapPay API
        const tapPayRes = yield axios_1.default.post(TAPPAY_SANDBOX_URL, {
            prime,
            partner_key: TAPPAY_PARTNER_KEY,
            merchant_id: TAPPAY_MERCHANT_ID,
            details: "Wishlist App Items",
            amount: details.amount,
            cardholder: {
                phone_number: user.phoneNumber || "0912345678",
                name: user.name || "Guest",
                email: "test@example.com" // Required field, stick to dummy if not in user
            },
            remember: false
        }, {
            headers: {
                'x-api-key': TAPPAY_PARTNER_KEY
            }
        });
        const tapPayData = tapPayRes.data;
        if (tapPayData.status !== 0) {
            console.error('[Payment] TapPay Error:', tapPayData);
            return res.status(400).json({ error: `Payment Failed: ${tapPayData.msg}`, tapPayStatus: tapPayData.status });
        }
        console.log('[Payment] Success:', tapPayData);
        // Update User Status in Database based on purchase
        // Simplification: If amount == 90, it's premium. If amount == 30, it's Limit.
        // Ideally pass 'type' from frontend.
        let purchaseType = 'UNKNOWN';
        if (details.amount === 90) {
            purchaseType = 'PREMIUM';
            yield prisma_1.default.user.update({
                where: { id: userId },
                data: { isPremium: true }
            });
        }
        else if (details.amount === 30) {
            purchaseType = 'LIMIT_WISHLIST'; // OR LIMIT_FOLLOWING, ambiguity here.
            // For now, let's assume the frontend passes 'type' in body separately if needed, 
            // OR we strictly define amounts. 
            // Better: Add 'purchaseType' to req.body
        }
        // Let's handle explicit purchaseType from frontend if provided
        // purchaseType: 'limit', target: 'wishlists'|'following'
        if (req.body.purchaseType) {
            purchaseType = req.body.purchaseType;
            const target = req.body.target;
            if (purchaseType === 'PREMIUM') {
                yield prisma_1.default.user.update({ where: { id: userId }, data: { isPremium: true } });
            }
            else if (purchaseType === 'limit') {
                // Check target
                if (target === 'following') {
                    yield prisma_1.default.user.update({ where: { id: userId }, data: { maxFollowing: { increment: 10 } } });
                    purchaseType = 'LIMIT_FOLLOWING';
                }
                else {
                    // Default to Wishlists
                    yield prisma_1.default.user.update({ where: { id: userId }, data: { maxWishlistItems: { increment: 10 } } });
                    purchaseType = 'LIMIT_WISHLIST';
                }
            }
        }
        else {
            // Fallback by amount logic if needed
            if (details.amount === 90) {
                yield prisma_1.default.user.update({ where: { id: userId }, data: { isPremium: true } });
                purchaseType = 'PREMIUM';
            }
        }
        // Record Purchase History
        yield prisma_1.default.purchase.create({
            data: {
                userId,
                type: purchaseType,
                amount: details.amount,
                currency: 'TWD',
                status: 'COMPLETED'
            }
        });
        res.json({ success: true, transactionId: tapPayData.rec_trade_id });
    }
    catch (error) {
        console.error('[Payment] Server Error:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message);
        res.status(500).json({ error: 'Internal server error during payment' });
    }
});
exports.payByPrime = payByPrime;
