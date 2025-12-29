import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { deleteItem, updateItem, cloneItem, watchItem, getItem } from '../controllers/itemController';

const router = express.Router();

router.use(authenticateToken);

router.get('/:id', getItem);
router.put('/:id', updateItem);
router.delete('/:id', deleteItem);
router.post('/:id/clone', cloneItem);
router.post('/:id/watch', watchItem);

export default router;
