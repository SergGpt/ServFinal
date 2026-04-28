'use strict';

const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '../../client_packages/browser/build/js/build.js');

if (!fs.existsSync(bundlePath)) {
  console.error('[verify-marketplace] build bundle not found:', bundlePath);
  process.exit(1);
}

const content = fs.readFileSync(bundlePath, 'utf8');

const checks = [
  { key: 'marketplace.phone.data', label: 'phone event wiring' },
  { key: 'PHONE_MARKETPLACE_LOTS', label: 'redux action in bundle' },
  { key: 'Маркет', label: 'phone app label' }
];

const failed = checks.filter(check => !content.includes(check.key));

if (failed.length) {
  console.error('[verify-marketplace] missing markers in build bundle:');
  failed.forEach(item => console.error(`- ${item.label}: ${item.key}`));
  process.exit(2);
}

console.log('[verify-marketplace] OK: marketplace markers found in build bundle.');
