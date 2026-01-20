"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const itemController_1 = require("../controllers/itemController");
const router = express_1.default.Router();
// Public Routes (No Auth)
router.get('/public', itemController_1.getPublicItems);
// Protected Routes
router.use(auth_1.authenticateToken);
router.get('/:id', itemController_1.getItem);
router.put('/:id', itemController_1.updateItem);
router.delete('/:id', itemController_1.deleteItem);
router.post('/:id/clone', itemController_1.cloneItem);
router.post('/:id/watch', itemController_1.watchItem);
exports.default = router;
