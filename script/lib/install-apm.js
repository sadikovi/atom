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
    // Only now does apm/node_modules/atom-package-manager/bin/node exist
    // (the rebuild above is what downloads it), so the cache can only be
    // warmed with it after this point.
    warmNodeGypHeaderCache();
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

function warmNodeGypHeaderCache() {
  // apm installs run with jobs=max (see script/config.js), so every native
  // module's `node-gyp rebuild` starts at once. They all need the same
  // Node headers tarball, and node-gyp's shared cache
  // (~/Library/Caches/node-gyp on macOS) isn't safe for concurrent first
  // writers: parallel downloads/extracts into it can stomp on each other
  // and fail with "fatal problem while downloading/extracting the
  // tarball". Downloading the headers once, serially, up front means every
  // later node-gyp invocation just finds a warm cache and reads from it.
  const atomPackageManagerPath = path.join(
    CONFIG.apmRootPath,
    'node_modules',
    'atom-package-manager'
  );
  const bundledNode = path.join(atomPackageManagerPath, 'bin', 'node');
  const bundledNodeGyp = path.join(
    atomPackageManagerPath,
    'node_modules',
    'npm',
    'node_modules',
    'node-gyp',
    'bin',
    'node-gyp.js'
  );
  console.log('Pre-warming the node-gyp header cache');
  childProcess.execFileSync(
    bundledNode,
    [bundledNodeGyp, 'install', '--arch=arm64'],
    { env: process.env, stdio: 'inherit' }
  );
}
