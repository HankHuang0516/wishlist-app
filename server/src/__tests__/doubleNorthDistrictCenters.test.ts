import { DOUBLE_NORTH_DISTRICTS } from '../lib/externalListingIntake';
import { DISTRICT_CENTER_SOURCE, districtCenter, districtsInBounds } from '../lib/doubleNorthDistrictCenters';

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
    it('uses only representative centers inside the requested map viewport', () => {
        expect(districtsInBounds([121.44, 25.00, 121.48, 25.03]))
            .toContainEqual({ county: '新北市', district: '板橋區' });
        expect(districtsInBounds([121.44, 25.00, 121.48, 25.03]))
            .not.toContainEqual({ county: '臺北市', district: '中正區' });
        expect(districtsInBounds([117, 20, 123.8, 26.6])).toHaveLength(41);
    });
});
