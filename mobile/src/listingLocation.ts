export type ListingLocation={county:string;district:string;latitude:string;longitude:string};
export function approximateListingPoint(longitude:number,latitude:number):Pick<ListingLocation,'latitude'|'longitude'> {
 if(!Number.isFinite(latitude)||latitude<20||latitude>26.6||!Number.isFinite(longitude)||longitude<117||longitude>123.8)throw Error('請選擇台灣範圍內的商品約略位置');
 return {latitude:Math.min(26.59,Math.floor(latitude/0.02)*0.02+0.01).toFixed(2),longitude:Math.min(123.79,Math.floor(longitude/0.02)*0.02+0.01).toFixed(2)};
}
