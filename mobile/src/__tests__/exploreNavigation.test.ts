import { describe, expect, it } from 'vitest';
import { exploreNavigationChange, exploreAutomaticSelection } from '../exploreNavigation';
describe('retained Explore receives navigation without losing an incoming target',()=>{
  it('does not start a second search on the first target mount, even when the target is not the first result',()=>{
    const first={listingId:'target',wishItemId:undefined};
    expect(exploreNavigationChange(first,first,1).searchChanged).toBe(false);
    expect(exploreAutomaticSelection(1,1,['another','target'],[])).toBeNull();
  });
  it('gives a new target priority over the first row in an already mounted Explore',()=>{
    const result=exploreNavigationChange({listingId:null,wishItemId:undefined},{listingId:'target',wishItemId:undefined},4);
    expect(result).toEqual({incomingTarget:true,searchChanged:true,cycle:5,targetHasPriority:true});
    expect(exploreAutomaticSelection(result.cycle,result.cycle,['another','target'],['external'])).toBeNull();
  });
  it('does not reset search when a target is acknowledged or source inquiry returns to the same wish',()=>{
    expect(exploreNavigationChange({listingId:'target',wishItemId:3},{listingId:null,wishItemId:3},5).searchChanged).toBe(false);
    expect(exploreNavigationChange({listingId:null,wishItemId:3},{listingId:null,wishItemId:3},5).searchChanged).toBe(false);
  });
  it('frames new wish results only after the wish actually changes',()=>{
    const result=exploreNavigationChange({listingId:null,wishItemId:3},{listingId:null,wishItemId:4},5);
    expect(result.cycle).toBe(6);
    expect(exploreAutomaticSelection(6,5,['first','second'],['external'])).toEqual({sellerId:'first',externalId:null});
  });
});
