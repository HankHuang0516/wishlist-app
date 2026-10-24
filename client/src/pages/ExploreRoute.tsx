import {useLocation} from 'react-router-dom';
import ExplorePage from './ExplorePage';
import ExploreDiscoveryPage from './ExploreDiscoveryPage';
import {isLegacyExplore} from '../lib/discovery';
// Preserve shared links, map and wish-specific legacy contracts. Ordinary
// exploration uses the unified discovery engine across all public sources.
export default function ExploreRoute(){return isLegacyExplore(useLocation().search)?<ExplorePage/>:<ExploreDiscoveryPage/>;}
