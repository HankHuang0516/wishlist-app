import express from 'express';
import request from 'supertest';
import mediaRoutes from '../routes/listingMediaRoutes';

jest.mock('../lib/userSession', () => ({ authenticateUserSession: async (token: string) => {
    if (token === 'synthetic-user-11') return { id: 11 };
    if (token === 'synthetic-user-12') return { id: 12 };
    throw new Error('Invalid synthetic account');
} }));
const previous = {
    enabled: process.env.MINIMAX_LISTING_AI_ENABLED,
    pilot: process.env.MINIMAX_LISTING_AI_PILOT_USER_ID,
    callback: process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN,
};
const app = express();
app.use('/api/listing-media', mediaRoutes);
const check = (id: number) => request(app).get('/api/listing-media/ai-availability')
    .set('Authorization', `Bearer synthetic-user-${id}`);

afterAll(() => {
    for (const [key, value] of Object.entries({ MINIMAX_LISTING_AI_ENABLED: previous.enabled,
        MINIMAX_LISTING_AI_PILOT_USER_ID: previous.pilot,
        WISHLIST_MINIMAX_CALLBACK_TOKEN: previous.callback })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

it('returns only this account’s real AI availability, never the pilot identity', async () => {
    delete process.env.MINIMAX_LISTING_AI_ENABLED;
    expect((await request(app).get('/api/listing-media/ai-availability')).status).toBe(401);
    expect((await check(11)).body).toEqual({ available: false });

    process.env.MINIMAX_LISTING_AI_ENABLED = '1';
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = 'synthetic-listing-ai-worker-token-at-least-32-chars';
    process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = '11';
    const pilot = await check(11);
    const other = await check(12);
    expect(pilot.status).toBe(200);
    expect(pilot.headers['cache-control']).toBe('private, no-store');
    expect(pilot.body).toEqual({ available: true });
    expect(other.body).toEqual({ available: false });
    expect(JSON.stringify(other.body)).not.toContain('11');

    delete process.env.MINIMAX_LISTING_AI_PILOT_USER_ID;
    expect((await check(12)).body).toEqual({ available: true });
    delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
    expect((await check(12)).body).toEqual({ available: false });
});
