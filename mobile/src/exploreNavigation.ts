export type ExploreNavigation = { listingId: string | null; wishItemId: number | undefined };
/** Clearing a handled target is an acknowledgement, not a new search. */
export function exploreNavigationChange(previous: ExploreNavigation, next: ExploreNavigation, cycle: number) {
  const incomingTarget=next.listingId!==null && next.listingId!==previous.listingId;
  const searchChanged=incomingTarget || next.wishItemId!==previous.wishItemId;
  return { incomingTarget, searchChanged, cycle:cycle+(searchChanged?1:0), targetHasPriority:incomingTarget };
}
/** A cycle already claimed by an incoming product must not pick the first row. */
export function exploreAutomaticSelection(cycle: number, claimedCycle: number, sellerIds: readonly string[], externalIds: readonly string[]) {
  if (cycle===claimedCycle) return null;
  return { sellerId:sellerIds[0]??null, externalId:sellerIds.length?null:externalIds[0]??null };
}
