import type { DiscoveryProduct } from './discovery';
import { cpTargets } from './discoveryCp';
import { retailIdentity } from './retailPrices';
export function cpCoverage(products: DiscoveryProduct[]) {
  const result = Object.fromEntries(['listing', 'source', 'external'].map(kind => [kind, { total:0, scored:0, highCp:0, assessedUnscored:0, originalPriceVerified:0, readyForEvaluation:0, missingPrice:0, missingModel:0, missingCondition:0, missingReference:0, excluded:0, pending:0 }]));
  for (const p of products) {
    const row = result[p.kind]; row.total++;
    if (p.retail) row.originalPriceVerified++;
    if (p.cp?.score !== null && p.cp?.score !== undefined) { row.scored++; if (p.cp.score >= 75) row.highCp++; continue; }
    row.pending++;
    if (p.cp) { row.assessedUnscored++; continue; }
    if (p.cpAllowed === false) row.excluded++;
    else if (p.price === null || p.price <= 0 || p.currency !== 'TWD' || !p.priceUnitVerified) row.missingPrice++;
    else if (!retailIdentity(p)) row.missingModel++;
    else if (!['NEW','USED'].includes(p.condition)) row.missingCondition++;
    else if (cpTargets([p]).length) row.readyForEvaluation++;
    else if (!p.retail) row.missingReference++;
    else row.excluded++;
  }
  return { complete:true, baseline:'ORIGINAL_NEW_RETAIL', policyVersion:3, byKind:result, checkedAt:new Date().toISOString() };
}
