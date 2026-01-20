import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { deleteItem, updateItem, cloneItem, watchItem, getItem, getPublicItems } from '../controllers/itemController';

const router = express.Router();

// Public Routes (No Auth)
router.get('/public', getPublicItems);

// Protected Routes
router.use(authenticateToken);

router.get('/:id', getItem);
router.put('/:id', updateItem);
router.delete('/:id', deleteItem);
router.post('/:id/clone', cloneItem);
router.post('/:id/watch', watchItem);

export default router;
