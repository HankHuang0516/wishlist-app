import {useLocation} from 'react-router-dom';
import {createLazyPage} from '../components/LazyPage';
import {isLegacyExplore} from '../lib/discovery';
// Preserve shared links, map and wish-specific legacy contracts. Ordinary
// exploration uses the unified discovery engine across all public sources.
// Each of the two pages is fetched only when its kind of address is opened, so ordinary exploration does not wait
// for the legacy page's map library. firstScreen/plan.ts names these two files; keep them in step.
const ExploreDiscoveryPage = createLazyPage(() => import('./ExploreDiscoveryPage'));
const LegacyExplorePage = createLazyPage(() => import('./ExplorePage'));
export default function ExploreRoute(){return isLegacyExplore(useLocation().search)?<LegacyExplorePage/>:<ExploreDiscoveryPage/>;}
