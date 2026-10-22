// No region could be assigned (group name/description names none): never on the map, searchable only
// by clients that opt in, and always labelled that the seller must be contacted for the meeting point.
export const CONTACT_LOCATION_TYPE = 'SELLER_CONTACT_REQUIRED';
export const CONTACT_LOCATION_NOTICE = '未提供地區；面交地點需聯絡賣家後才知道，寄送不受影響。庫存與交易待確認。';
export function isContactLocation(evidence: unknown) { return !!evidence && typeof evidence === 'object' && (evidence as any).locationType === CONTACT_LOCATION_TYPE; }
