// Embeds the app icon into the packed executable.
//
// electron-builder would normally do this itself, but only when
// signAndEditExecutable is on — and turning that on makes it download
// winCodeSign, whose archive contains symlinks Windows refuses to
// extract without Developer Mode. That download fails and takes the
// whole build with it.
//
// So signing stays off and we set the icon directly with rcedit, which
// ships a prebuilt binary and needs no toolchain.

const path = require('path');
// rcedit v5 is ESM with a named export; required from CJS it arrives as
// { rcedit }, not as the function itself.
const { rcedit } = require('rcedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(__dirname, '..', 'build', 'icon.ico');
  const version = context.packager.appInfo.version;

  await rcedit(exe, {
    icon,
    'version-string': {
      ProductName: 'Command Center',
      FileDescription: 'Command Center',
      CompanyName: 'Command Center',
      LegalCopyright: ''
    },
    'file-version': version,
    'product-version': version
  });

  console.log(`  • icon embedded  file=${exe}`);
};
