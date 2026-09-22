import type { Request, Response } from 'express';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';

const key = 'synthetic-marketplace-guard-test-key';
const invoke = (getCredential: () => unknown, properties: object) => {
    const json = jest.fn();
    const response: { status: jest.Mock; json: jest.Mock } = { status: jest.fn(() => response), json };
    const next = jest.fn();
    marketplaceAdmin(getCredential)({ headers: {}, query: {}, ...properties } as Request, response as unknown as Response, next);
    return { response, next };
};
describe('moderation route guard (not yet a mounted moderation API)', () => {
    it('passes exact header authorization once', () => {
        const result = invoke(() => key, { headers: { 'x-admin-key': key } });
        expect(result.next).toHaveBeenCalledTimes(1); expect(result.response.json).not.toHaveBeenCalled();
    });
    it.each([{}, { key }, { role: 'admin', isAdmin: true }, { user: { id: 7, isAdmin: true } },
        { headers: { authorization: 'Bearer synthetic-user-token' }, body: { isAdmin: true } },
        { headers: { 'x-admin-key': [key] } }, { headers: { 'x-admin-key': 'wrong-key' } }])('rejects client-supplied claims or malformed headers %#', properties => {
        const result = invoke(() => key, properties);
        expect(result.response.status).toHaveBeenCalledWith(401); expect(result.next).not.toHaveBeenCalled();
        expect(JSON.stringify(result.response.json.mock.calls)).not.toContain(key);
    });
    it.each([{}, { headers: { 'x-admin-key': key } }])('rejects URL credentials, even alongside the correct header %#', properties => {
        const result = invoke(() => key, { ...properties, query: { key } });
        expect(result.response.status).toHaveBeenCalledWith(400); expect(result.next).not.toHaveBeenCalled();
        expect(JSON.stringify(result.response.json.mock.calls)).not.toContain(key);
    });
    it('fails closed when no server key is configured', () => {
        const result = invoke(() => undefined, { headers: { 'x-admin-key': key } });
        expect(result.response.status).toHaveBeenCalledWith(503); expect(result.next).not.toHaveBeenCalled();
    });
    it('does not serialize credential-reader exceptions', () => {
        const result = invoke(() => { throw new Error(key); }, {});
        expect(result.response.status).toHaveBeenCalledWith(503); expect(result.next).not.toHaveBeenCalled();
        expect(JSON.stringify(result.response.json.mock.calls)).not.toContain(key);
    });
    it('reads current server configuration rather than caching a client value', () => {
        let configured: string | undefined = key;
        const guard = marketplaceAdmin(() => configured);
        const next = jest.fn(), response: any = { status: jest.fn(() => response), json: jest.fn() };
        guard({ headers: { 'x-admin-key': key }, query: {} } as unknown as Request, response, next);
        expect(next).toHaveBeenCalledTimes(1);
        configured = undefined;
        guard({ headers: { 'x-admin-key': key }, query: {} } as unknown as Request, response, next);
        expect(next).toHaveBeenCalledTimes(1); expect(response.status).toHaveBeenCalledWith(503);
    });
});
