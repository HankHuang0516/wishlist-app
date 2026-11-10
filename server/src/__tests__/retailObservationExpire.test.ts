import express from 'express';
import { createLoopbackRequest } from './integration/loopbackHttp';
import prisma from '../lib/prisma';
import { createRetailPriceAdmin } from '../routes/retailPriceRoutes';

jest.mock('../lib/prisma', () => ({ __esModule: true, default: { retailPriceObservation: { findUnique: jest.fn(), update: jest.fn() } } }));

const KEY = 'test-admin-key';
const ID = '7d6e68e4-1f2a-4b3c-8d4e-5f6a7b8c9d0e';
const app = express();
app.use(express.json());
app.use('/retail', createRetailPriceAdmin(() => KEY));
const http = createLoopbackRequest(app);
const db = prisma as unknown as { retailPriceObservation: { findUnique: jest.Mock; update: jest.Mock } };

test('expiring a verified price needs the admin key, a UUID and a reason', async () => {
  expect((await http.post(`/retail/observations/${ID}/expire`).send({ reason: 'x' })).status).toBe(401);
  expect((await http.post('/retail/observations/not-a-uuid/expire').set('X-Admin-Key', KEY).send({ reason: 'x' })).status).toBe(400);
  expect((await http.post(`/retail/observations/${ID}/expire`).set('X-Admin-Key', KEY).send({})).status).toBe(400);
  expect((await http.post(`/retail/observations/${ID}/expire`).set('X-Admin-Key', KEY).send({ reason: 'x', extra: 1 })).status).toBe(400);
  db.retailPriceObservation.findUnique.mockResolvedValueOnce(null);
  expect((await http.post(`/retail/observations/${ID}/expire`).set('X-Admin-Key', KEY).send({ reason: '配件誤配' })).status).toBe(404);
  expect(db.retailPriceObservation.update).not.toHaveBeenCalled();
});

test('expiring sets expiresAt to now, keeps the row, and records the reason in the notes', async () => {
  const future = new Date(Date.now() + 86_400_000);
  db.retailPriceObservation.findUnique.mockResolvedValueOnce({ id: ID, status: 'VERIFIED', expiresAt: future, notes: '確定性查價 pchome' });
  db.retailPriceObservation.update.mockImplementationOnce(async ({ data }: { data: { expiresAt: Date; notes: string } }) => ({ id: ID, status: 'VERIFIED', expiresAt: data.expiresAt, notes: data.notes }));
  const r = await http.post(`/retail/observations/${ID}/expire`).set('X-Admin-Key', KEY).send({ reason: 'PChome 配到 EOS 800D 的配件，不是機身' });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ id: ID, status: 'VERIFIED', alreadyExpired: false });
  expect(Date.parse(r.body.expiredAt)).toBeLessThanOrEqual(Date.now());
  const call = db.retailPriceObservation.update.mock.calls[0][0];
  expect(call.where).toEqual({ id: ID });
  expect(call.data.notes).toContain('確定性查價 pchome');
  expect(call.data.notes).toContain('撤回');
  expect(call.data.notes).toContain('EOS 800D');
  // already expired: reported, not touched again
  db.retailPriceObservation.findUnique.mockResolvedValueOnce({ id: ID, status: 'VERIFIED', expiresAt: new Date(Date.now() - 1000), notes: null });
  const again = await http.post(`/retail/observations/${ID}/expire`).set('X-Admin-Key', KEY).send({ reason: 'x' });
  expect(again.body.alreadyExpired).toBe(true);
  expect(db.retailPriceObservation.update).toHaveBeenCalledTimes(1);
});
