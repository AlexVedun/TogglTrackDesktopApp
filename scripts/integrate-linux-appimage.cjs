const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'linux') {
  console.error('Desktop integration is available on Linux only.');
  process.exit(1);
}

if (process.argv.length !== 3) {
  console.error('Usage: npm run integrate:linux -- /path/to/application.AppImage');
  process.exit(1);
}

const appImage = fs.realpathSync(process.argv[2]);
if (!appImage.endsWith('.AppImage') || !fs.statSync(appImage).isFile() || /[\r\n]/.test(appImage)) {
  throw new Error('Provide the path to an AppImage file.');
}

const projectRoot = path.join(__dirname, '..');
const { desktopName, name, build } = require(path.join(projectRoot, 'package.json'));
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const iconName = name;

for (const file of fs.readdirSync(path.join(projectRoot, 'build', 'icons'))) {
  if (!/^\d+x\d+\.png$/.test(file)) continue;
  const size = file.slice(0, -4);
  const targetDir = path.join(dataHome, 'icons', 'hicolor', size, 'apps');
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, `${iconName}.png`);
  fs.copyFileSync(path.join(projectRoot, 'build', 'icons', file), target);
  fs.chmodSync(target, 0o644);
}

// Desktop Entry Exec values require quoting for paths containing spaces.
const escapedPath = appImage.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  .replaceAll('$', '\\$').replaceAll('`', '\\`');
const desktopEntry = [
  '[Desktop Entry]',
  `Name=${build.productName}`,
  `Exec="${escapedPath}" %U`,
  'Terminal=false',
  'Type=Application',
  `Icon=${iconName}`,
  `StartupWMClass=${desktopName}`,
  'Categories=Office;',
  'StartupNotify=true',
  ''
].join('\n');
const applicationsDir = path.join(dataHome, 'applications');
fs.mkdirSync(applicationsDir, { recursive: true });
const desktopFile = path.join(applicationsDir, `${desktopName}.desktop`);
fs.writeFileSync(desktopFile, desktopEntry, { mode: 0o644 });
fs.chmodSync(desktopFile, 0o644);
console.log(`Installed desktop entry: ${desktopFile}`);
