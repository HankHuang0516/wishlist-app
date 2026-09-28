import { validateApiUrl } from './api';
import { uuid } from './listingForm';
import type { ManagedListing } from './managedListing';

/** Published IDs remain stable. The public page hides content once a listing is no longer discoverable. */
export function listingShareUrl(item: Pick<ManagedListing, 'id' | 'publishedAt'>, apiUrl: string, local = false): string | null {
  if (!item.publishedAt || !uuid(item.id)) return null;
  const origin = new URL(validateApiUrl(apiUrl, local)).origin;
  return `${origin}/listings/${item.id}`;
}
