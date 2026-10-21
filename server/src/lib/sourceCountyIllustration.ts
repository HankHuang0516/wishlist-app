// County-wide illustrative pins, NEVER pickup, seller, stock, or precise item locations.
// Selected existing administrative centers from Chunghwa Post dataset 25489.
// XML SHA256 checked 2026-10-03: 5bdc716df9170166b3e62183a38b69851ca1d95208964485a3d8cc291316a8d7.
// Government Open Data License v1. These county representatives share one point per county.
export const COUNTY_ILLUSTRATION_SOURCE = 'https://data.gov.tw/dataset/25489';
export const COUNTY_ILLUSTRATION_LABEL = '概略位置，非取貨點';
export const UNKNOWN_SOURCE_DISTRICT='行政區未明示';
const representatives: Record<string, {latitude:number;longitude:number;key:string}> = {
 '臺北市': {latitude:25.03240487,longitude:121.5198839,key:'POST_100_COUNTY_ILLUSTRATION'},
 '桃園市': {latitude:25.00040024,longitude:121.2996612,key:'POST_330_COUNTY_ILLUSTRATION'},
 '新北市': {latitude:25.01186453,longitude:121.4579675,key:'POST_220_COUNTY_ILLUSTRATION'},
 // Remaining counties: center of the district holding the county/city government (same dataset and SHA).
 '基隆市': {latitude:25.14365754,longitude:121.7783549,key:'POST_202_COUNTY_ILLUSTRATION'},
 '新竹市': {latitude:24.82269542,longitude:120.9491233,key:'POST_300_COUNTY_ILLUSTRATION'},
 '新竹縣': {latitude:24.83816209,longitude:120.9948704,key:'POST_302_COUNTY_ILLUSTRATION'},
 '苗栗縣': {latitude:24.56382141,longitude:120.8112299,key:'POST_360_COUNTY_ILLUSTRATION'},
 '臺中市': {latitude:24.18308895,longitude:120.6270131,key:'POST_407_COUNTY_ILLUSTRATION'},
 '彰化縣': {latitude:24.07532909,longitude:120.5694208,key:'POST_500_COUNTY_ILLUSTRATION'},
 '南投縣': {latitude:23.92173537,longitude:120.6787658,key:'POST_540_COUNTY_ILLUSTRATION'},
 '雲林縣': {latitude:23.70651883,longitude:120.5600044,key:'POST_640_COUNTY_ILLUSTRATION'},
 '嘉義市': {latitude:23.48170334,longitude:120.4706244,key:'POST_600_COUNTY_ILLUSTRATION'},
 '嘉義縣': {latitude:23.4729191,longitude:120.3440009,key:'POST_612_COUNTY_ILLUSTRATION'},
 '臺南市': {latitude:22.99008437,longitude:120.1649949,key:'POST_708_COUNTY_ILLUSTRATION'},
 '高雄市': {latitude:22.62359448,longitude:120.3209103,key:'POST_802_COUNTY_ILLUSTRATION'},
 '屏東縣': {latitude:22.6647375,longitude:120.4799948,key:'POST_900_COUNTY_ILLUSTRATION'},
 '宜蘭縣': {latitude:24.75021184,longitude:121.7569358,key:'POST_260_COUNTY_ILLUSTRATION'},
 '花蓮縣': {latitude:23.99700271,longitude:121.6071463,key:'POST_970_COUNTY_ILLUSTRATION'},
 '臺東縣': {latitude:22.75165721,longitude:121.1103647,key:'POST_950_COUNTY_ILLUSTRATION'},
 '澎湖縣': {latitude:23.55534,longitude:119.59234,key:'POST_880_COUNTY_ILLUSTRATION'},
 '金門縣': {latitude:24.38402,longitude:118.30128,key:'POST_893_COUNTY_ILLUSTRATION'},
 '連江縣': {latitude:26.154321,longitude:119.931128,key:'POST_209_COUNTY_ILLUSTRATION'},
};
export function countyIllustration(county:string) {return representatives[county]??null;}
export function isCountyIllustration(evidence:unknown) {return !!evidence&&typeof evidence==='object'&&(evidence as any).locationType==='COUNTY_ILLUSTRATION';}
