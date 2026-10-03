import { readFileSync } from 'fs';
import path from 'path';
import { parseListingCreate } from '../lib/listingRules';
// The exact shared fixtures are also consumed by the web crypto hash tests.
const fixtures = JSON.parse(readFileSync(path.resolve(__dirname, '../../../shared/listing-create-hash-fixtures.json'), 'utf8')) as { body: object; requestHash: string }[];
const draftFixtures = JSON.parse(readFileSync(path.resolve(__dirname, '../../../shared/listing-draft-create-hash-fixtures.json'), 'utf8')) as { body: object; requestHash: string }[];
describe('immutable web/server listing creation hash compatibility', () => {
    it.each(fixtures)('matches default/custom/expired canonical hash fixture %#', ({ body, requestHash }) => {
        expect(parseListingCreate(body, new Date(0)).requestHash).toBe(requestHash);
    });
    it.each(draftFixtures)('matches native incomplete/private draft canonical hash %#', ({ body, requestHash }) => {
        expect(parseListingCreate(body, new Date(0)).requestHash).toBe(requestHash);
    });
});
