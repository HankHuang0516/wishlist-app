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
};
export function countyIllustration(county:string) {return representatives[county]??null;}
export function isCountyIllustration(evidence:unknown) {return !!evidence&&typeof evidence==='object'&&(evidence as any).locationType==='COUNTY_ILLUSTRATION';}
