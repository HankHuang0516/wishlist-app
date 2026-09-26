// The native Android directory is generated and ignored by Git. Keep its
// release identity aligned with the tracked Expo config before each local build.
function alignAndroidGradle(gradle, { packageName, versionCode, versionName }) {
  const applicationIds = [...gradle.matchAll(/^[ \t]*applicationId[ \t]+'([^']+)'[ \t]*$/gm)];
  const codes = [...gradle.matchAll(/^([ \t]*versionCode[ \t]+)\d+[ \t]*$/gm)];
  const names = [...gradle.matchAll(/^([ \t]*versionName[ \t]+)"[^"]+"[ \t]*$/gm)];
  if (applicationIds.length !== 1 || applicationIds[0][1] !== packageName || codes.length !== 1 || names.length !== 1) {
    throw new Error('Generated Android identity/version fields are missing, duplicated, or do not match the published package');
  }
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || !/^\d+\.\d+\.\d+$/.test(versionName)) {
    throw new Error('Expo Android release version is invalid');
  }
  return gradle
    .replace(/^([ \t]*versionCode[ \t]+)\d+[ \t]*$/m, (_, prefix) => `${prefix}${versionCode}`)
    .replace(/^([ \t]*versionName[ \t]+)"[^"]+"[ \t]*$/m, (_, prefix) => `${prefix}"${versionName}"`);
}

module.exports = { alignAndroidGradle };
