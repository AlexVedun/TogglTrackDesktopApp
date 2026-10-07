const fs = require('node:fs');
const path = require('node:path');

if (process.env.GITHUB_REF_TYPE !== 'tag') process.exit(0);

const tag = process.env.GITHUB_REF_NAME || '';
const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag);
if (!match) {
  console.error(`Expected a version tag such as v1.2.3, got: ${tag}`);
  process.exit(1);
}

const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.version = match[1];
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Building version ${packageJson.version}`);
