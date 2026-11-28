// Bundles the Simulator into one self-contained dist/preview.html (for sharing/previewing without a server).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const js = (await build({
  stdin: {
    contents: "import { createRoot } from 'react-dom/client'; import S from '@/components/Simulator'; createRoot(document.getElementById('root')).render(<S />);",
    loader: 'tsx', resolveDir: '.',
  },
  bundle: true, minify: true, write: false, jsx: 'automatic', format: 'iife', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_PREVIEW': '"1"' },
})).outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = execFileSync('npx', ['@tailwindcss/cli', '-i', 'app/globals.css', '--minify'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// The artifact cannot load external fonts: inline Satoshi's woff2 files as data: URLs.
// curl, not fetch: fetch ignores the sandbox HTTPS proxy and cannot resolve the host.
const get = (u) => execFileSync('curl', ['-sSfL', u], { maxBuffer: 1 << 26 });
let fontCss = get('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap').toString()
  .replace(/,\s*url\([^)]*\.(woff|ttf)['"]?\)\s*format\([^)]*\)/g, ''); // woff2 only
for (const [, u] of [...fontCss.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)]) {
  const b64 = get(u.startsWith('//') ? `https:${u}` : u).toString('base64');
  fontCss = fontCss.replaceAll(u, `data:font/woff2;base64,${b64}`);
}

mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', `<title>Pawprint Ledger</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${fontCss}</style>
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`);
console.log(`dist/preview.html ${(js.length + css.length) >> 10} KB`);
