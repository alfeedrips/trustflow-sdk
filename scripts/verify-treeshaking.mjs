import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

// Tree-shaking check: import a single named export from root entry and verify small bundle size
const fixtureCode = `import { isValidEscrowId } from '../dist/index.mjs'; console.log(isValidEscrowId('esc-1'));`;
const outDir = path.resolve('node_modules/.cache/treeshake-test');
fs.mkdirSync(outDir, { recursive: true });
const fixturePath = path.join(outDir, 'input.js');
const outPath = path.join(outDir, 'bundle.js');

fs.writeFileSync(fixturePath, fixtureCode);

await build({
  entryPoints: [fixturePath],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: outPath,
});

const stats = fs.statSync(outPath);
const sizeKb = stats.size / 1024;
console.log(`Tree-shaking test bundle size: ${sizeKb.toFixed(2)} KB`);

if (sizeKb > 25) {
  console.error(`Tree-shaking regression: bundle size ${sizeKb.toFixed(2)} KB exceeds budget`);
  process.exit(1);
}
console.log('✓ Tree-shaking verification passed');
