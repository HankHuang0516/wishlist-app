// Read only the authoritative resumed-activity fields. Android 8 reports
// mResumedActivity; newer releases also expose topResumedActivity.
function foregroundPackage(activity) {
  if (typeof activity !== 'string') return null;
  const packages = new Set();
  for (const match of activity.matchAll(/^\s*(?:topResumedActivity|mResumedActivity)\s*[:=]\s*([^\n]+)$/gm)) {
    const component = match[1].match(/(?:^|\s)([A-Za-z][A-Za-z0-9_.]+)\/[A-Za-z0-9_.$]+(?:\s|}|$)/);
    if (component) packages.add(component[1]);
  }
  return packages.size === 1 ? [...packages][0] : null;
}
module.exports = { foregroundPackage };
