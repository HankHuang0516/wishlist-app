import { LeadError } from './sourceLeadPrimitives';

// A live marketplace page may omit its listing date. Keep those dates null;
// the independently recorded observation is a separate, explicitly bound fact.
export function observedShopeeListing(facts: Record<string, any>, now = new Date(), archiveItemId?: string) {
 const e = facts.evidence ?? {}, o = e.observedListing;
 if (o === undefined) return null;
 const invalid = () => { throw new LeadError('BOUND_SHOPEE_OBSERVATION_REQUIRED'); };
 if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !['provider','shopId','itemId','firstObservedAt','availability'].includes(k))) return invalid();
 if (o.provider !== 'SHOPEE' || typeof o.shopId !== 'string' || typeof o.itemId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(o.shopId) || !/^[1-9][0-9]{0,19}$/.test(o.itemId) || o.availability !== 'VISIBLE_PURCHASE_CONTROL') return invalid();
 let u: URL; try { u = new URL(facts.canonicalUrl); } catch { return invalid(); }
 const path = u.pathname, suffix = '-i.' + o.shopId + '.' + o.itemId;
 if (u.origin !== 'https://shopee.tw' || u.username || u.password || u.port || u.search || u.hash || !(path === '/product/' + o.shopId + '/' + o.itemId || path.length > suffix.length + 1 && path.endsWith(suffix) && path.slice(1).indexOf('/') === -1)) return invalid();
 if (archiveItemId !== undefined && !new RegExp('^SP' + o.shopId + '-' + o.itemId + '-[0-9]{2}$').test(archiveItemId)) return invalid();
 if (facts.postedEarliestAt !== null || facts.postedLatestAt !== null || typeof o.firstObservedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(o.firstObservedAt)) return invalid();
 const first = new Date(o.firstObservedAt), checked = new Date(facts.checkedAt);
 if (!Number.isFinite(+first) || first.toISOString() !== o.firstObservedAt.replace('Z','.000Z') || !Number.isFinite(+checked) || first > checked || checked > now || first > now) return invalid();
 if (e.publicSourceRef !== 'source:shopee-item/' + o.shopId + '.' + o.itemId || e.dateRef !== 'source:shopee-first-observed/' + o.shopId + '.' + o.itemId || e.publicFacts?.originalDateLabel !== '刊登日期未提供；首次查核 ' + o.firstObservedAt) return invalid();
 return first;
}
