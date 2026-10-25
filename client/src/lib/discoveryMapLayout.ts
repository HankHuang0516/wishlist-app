// This pure shared module has an independent compiler configuration. Web uses the
// same file so category placement and minimum touch sizes cannot drift apart.
export {discoveryMapLayout,parsePublicMapLocation} from '../../../mobile/shared/discoveryMapLayout';
export type {MapCatalog,ThumbnailNode,MapHeading,MapGroupBox,PublicMapLocation} from '../../../mobile/shared/discoveryMapLayout';
