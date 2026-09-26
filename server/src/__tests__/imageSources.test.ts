import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { imageSources } from '../config/imageSources';

test('private photo object URLs are permitted only as image sources', async () => {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], imgSrc: imageSources, scriptSrc: ["'self'"],
  } } }));
  app.get('/', (_req, res) => res.sendStatus(204));
  const response = await request(app).get('/');
  expect(response.status).toBe(204);
  const csp = response.headers['content-security-policy'] as string;
  expect(csp).toMatch(/(?:^|;)img-src [^;]*\bblob:/);
  expect(csp).not.toMatch(/(?:^|;)script-src [^;]*\bblob:/);
});
