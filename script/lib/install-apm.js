'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');

module.exports = function(ci) {
  if (ci) {
    // Tell apm not to dedupe its own dependencies during its
    // postinstall script. (Deduping during `npm ci` runs is broken.)
    process.env.NO_APM_DEDUPE = 'true';
  }
  console.log('Installing apm');
  const npmBin = CONFIG.getLocalNpmBinPath();
  const installArgs = [
    '--global-style',
    '--loglevel=error',
    ci ? 'ci' : 'install'
  ];

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    // Every published atom-package-manager version bundles its own private
    // copy of Node (for running the standalone `apm` binary) pinned to a
    // Node 12.x release, none of which shipped a darwin-arm64 build. Its
    // postinstall script fails outright trying to download one, which
    // aborts the whole `npm ci`/`install` before we get a chance to do
    // anything about it. Install without running lifecycle scripts, point
    // its bundled-node download at whatever Node is actually running this
    // build (which does have a darwin-arm64 build, since it got us this
    // far), then let it finish installing.
    childProcess.execFileSync(npmBin, [...installArgs, '--ignore-scripts'], {
      env: process.env,
      cwd: CONFIG.apmRootPath
    });
    pinBundledNodeVersionToRunningNode();
    childProcess.execFileSync(npmBin, ['rebuild', '--loglevel=error'], {
      env: process.env,
      cwd: CONFIG.apmRootPath
    });
  } else {
    childProcess.execFileSync(npmBin, installArgs, {
      env: process.env,
      cwd: CONFIG.apmRootPath
    });
  }
};

function pinBundledNodeVersionToRunningNode() {
  const bundledNodeVersionPath = path.join(
    CONFIG.apmRootPath,
    'node_modules',
    'atom-package-manager',
    'BUNDLED_NODE_VERSION'
  );
  fs.writeFileSync(bundledNodeVersionPath, `v${process.versions.node}\n`);
}
