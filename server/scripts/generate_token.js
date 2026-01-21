
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET || 'secret_key_default';
const token = jwt.sign({ id: 1 }, secret, { expiresIn: '1h' });

console.log('GOD_TOKEN:', token);
