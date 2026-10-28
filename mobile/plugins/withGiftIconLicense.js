const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const filename = 'Lucide-Gift-LICENSE.txt';
function copyNotice(config, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(config.modRequest.projectRoot, 'icon-source/LUCIDE-LICENSE.txt'), destination);
}

// The icon reuses the Web's licensed Lucide paths. Ship the original notice
// with both native packages without adding a new user-facing flow.
module.exports = config => {
  config = withDangerousMod(config, ['android', async mod => {
    copyNotice(mod, path.join(mod.modRequest.platformProjectRoot, 'app/src/main/assets', filename));
    return mod;
  }]);
  return withXcodeProject(config, mod => {
    const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    copyNotice(mod, path.join(mod.modRequest.platformProjectRoot, name, filename));
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: filename, groupName: name, project: mod.modResults, isBuildFile: true,
    });
    return mod;
  });
};
