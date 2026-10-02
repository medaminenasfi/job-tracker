// Assembles preview/preview.html as a fully self-contained page: inlined popup
// CSS, a chrome-API stub, and the real built popup entry (its two static chunk
// imports rewritten to data: URLs so no other files need to be served).
// Run after `npm run build`: node preview/build-preview.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'dist', 'assets');
const names = fs.readdirSync(assets);

const pick = (re, label) => {
  const found = names.filter(re.test.bind(re));
  if (found.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found: ${found.join(', ') || 'none'}`);
  }
  return found[0];
};

const entryName = pick(/^popup\.html-.*\.js$/, 'popup entry');
const cssName = pick(/^popup-.*\.css$/, 'popup css');
const configName = pick(/^config-.*\.js$/, 'config chunk');
const messagesName = pick(/^messages-.*\.js$/, 'messages chunk');

const dataUrl = (file) =>
  'data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(assets, file), 'utf8'));

let entry = fs.readFileSync(path.join(assets, entryName), 'utf8');
for (const chunk of [configName, messagesName]) {
  entry = entry.split(`"./${chunk}"`).join(JSON.stringify(dataUrl(chunk)));
}
if (/from"\.\//.test(entry)) {
  throw new Error('Entry still imports a relative chunk — update this script');
}

const css = fs.readFileSync(path.join(root, 'src', 'popup.css'), 'utf8');
const stub = fs.readFileSync(path.join(__dirname, 'chrome-stub.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="light" />
    <title>Job Tracker popup — design preview</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${stub}
    </script>
    <script type="module">
${entry}
    </script>
  </body>
</html>
`;

const out = path.join(__dirname, 'preview.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(1)} kB)`);
