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

mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', `<title>Pawprint Ledger</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`);
console.log(`dist/preview.html ${(js.length + css.length) >> 10} KB`);
