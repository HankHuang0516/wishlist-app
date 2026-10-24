import {useLocation} from 'react-router-dom';
import ExplorePage from './ExplorePage';
import ExploreDiscoveryPage from './ExploreDiscoveryPage';
// Preserve shared links, map and wish-specific legacy contracts. Ordinary
// exploration uses the unified discovery engine across all public sources.
export default function ExploreRoute(){const p=new URLSearchParams(useLocation().search);return ['view','scope','bbox','wish','wishItemId','listing','external'].some(k=>p.has(k))||p.has('source')&&!['all','listing','source','external'].includes(p.get('source')!)?<ExplorePage/>:<ExploreDiscoveryPage/>;}
