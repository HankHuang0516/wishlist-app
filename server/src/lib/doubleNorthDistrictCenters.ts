// Area representatives, NEVER an item's or seller's precise location.
// Source: Chunghwa Post, "3碼郵遞區號與行政區中心點經緯度對照表",
// https://data.gov.tw/dataset/25489 (Government Open Data License v1).
// Source XML SHA-256, checked 2026-09-25:
// 5bdc716df9170166b3e62183a38b69851ca1d95208964485a3d8cc291316a8d7
export const DISTRICT_CENTER_SOURCE = 'https://data.gov.tw/dataset/25489';
const centers: Record<string, readonly [number, number]> = {
    '臺北市中正區': [25.03240, 121.51988], '臺北市大同區': [25.06342, 121.51304],
    '臺北市中山區': [25.06970, 121.53816], '臺北市松山區': [25.05999, 121.55759],
    '臺北市大安區': [25.02677, 121.54344], '臺北市萬華區': [25.02859, 121.49799],
    '臺北市信義區': [25.03062, 121.57167], '臺北市士林區': [25.12547, 121.55085],
    '臺北市北投區': [25.14807, 121.51780], '臺北市內湖區': [25.08371, 121.59238],
    '臺北市南港區': [25.03601, 121.60976], '臺北市文山區': [24.98858, 121.57361],
    '新北市萬里區': [25.17572, 121.64393], '新北市金山區': [25.21715, 121.60526],
    '新北市板橋區': [25.01186, 121.45797], '新北市汐止區': [25.07331, 121.65470],
    '新北市深坑區': [24.99768, 121.62006], '新北市石碇區': [24.94714, 121.64723],
    '新北市瑞芳區': [25.09813, 121.82320], '新北市平溪區': [25.02607, 121.75788],
    '新北市雙溪區': [24.99698, 121.83298], '新北市貢寮區': [25.02486, 121.91825],
    '新北市新店區': [24.93039, 121.53166], '新北市坪林區': [24.91097, 121.72422],
    '新北市烏來區': [24.78824, 121.54148], '新北市永和區': [25.00810, 121.51675],
    '新北市中和區': [24.99088, 121.49367], '新北市土城區': [24.96425, 121.44574],
    '新北市三峽區': [24.88210, 121.41631], '新北市樹林區': [24.97971, 121.40103],
    '新北市鶯歌區': [24.95663, 121.34663], '新北市三重區': [25.06282, 121.48710],
    '新北市新莊區': [25.03583, 121.43675], '新北市泰山區': [25.05550, 121.41628],
    '新北市林口區': [25.10009, 121.35272], '新北市蘆洲區': [25.08927, 121.47125],
    '新北市五股區': [25.09615, 121.43321], '新北市八里區': [25.13813, 121.41384],
    '新北市淡水區': [25.18908, 121.46390], '新北市三芝區': [25.23160, 121.51556],
    '新北市石門區': [25.26518, 121.56928],
};

export function districtCenter(county: string, district: string) {
    const center = centers[county + district];
    return center ? { latitude: center[0], longitude: center[1], precision: 'DISTRICT_CENTER' as const,
        source: DISTRICT_CENTER_SOURCE } : null;
}

export function districtsInBounds([west, south, east, north]: readonly [number, number, number, number]) {
    return Object.entries(centers).flatMap(([place, [latitude, longitude]]) => {
        if (longitude < west || longitude > east || latitude < south || latitude > north) return [];
        const county = place.startsWith('臺北市') ? '臺北市' : '新北市';
        return [{ county, district: place.slice(county.length) }];
    });
}
