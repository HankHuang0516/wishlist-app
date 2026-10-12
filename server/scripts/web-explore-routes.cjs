'use strict';
// Real compiled public handlers shared by the loopback smoke listener and
// isolated browser acceptance. No admin import/write route is exposed here.
module.exports = function mountExploreRoutes(app) {
  app.use('/api/explore-counts', require('../dist/routes/exploreCountRoutes').default);
  app.use('/api/source-leads', require('../dist/routes/sourceLeadRoutes').createSourceLeadRoutes());
  app.use('/api/external-listings', require('../dist/routes/externalListingRoutes').default);
};
