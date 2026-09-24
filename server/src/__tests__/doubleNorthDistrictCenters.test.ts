import { DOUBLE_NORTH_DISTRICTS } from '../lib/externalListingIntake';
import { DISTRICT_CENTER_SOURCE, districtCenter } from '../lib/doubleNorthDistrictCenters';

describe('public external map uses attributed district centers, never item coordinates', () => {
    it('covers all 41 currently accepted Taipei and New Taipei districts', () => {
        let count = 0;
        for (const [county, districts] of Object.entries(DOUBLE_NORTH_DISTRICTS)) for (const district of districts) {
            const center = districtCenter(county, district);
            expect(center).toMatchObject({ precision: 'DISTRICT_CENTER', source: DISTRICT_CENTER_SOURCE });
            expect(center!.latitude).toBeGreaterThan(24.7);
            expect(center!.latitude).toBeLessThan(25.4);
            expect(center!.longitude).toBeGreaterThan(121.3);
            expect(center!.longitude).toBeLessThan(122);
            count++;
        }
        expect(count).toBe(41);
        expect(districtCenter('臺北市', '不存在區')).toBeNull();
        expect(districtCenter('新北市', '中正區')).toBeNull();
    });
});
