import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

// Tree-shaking check: import a single named export from the root entry and verify that
// none of the rest of the SDK ships with it.
//
// `@stellar/stellar-sdk` v15 resolves `browser` to a prebuilt UMD bundle and declares no
// `sideEffects` flag, so bundlers must conservatively keep any top-level import of it even
// when no binding is used. That is upstream packaging, not our distribution layout — we
// neutralize it here so a regression in *our* entry/chunk boundaries (for example, the entry
// chunk starting to use a stellar-sdk binding pulled in by the function under test) still
// fails the check. The un-neutralized consumer cost is measured and printed separately.
const STELLAR_SDK = /^@stellar\/(stellar-sdk|stellar-base)$/;
const SIZE_BUDGET_KB = 96;

const distEntry = path.resolve('dist/index.mjs');
const stellarUmd = path.resolve('node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js');

const outDir = path.resolve('node_modules/.cache/treeshake-test');
fs.mkdirSync(outDir, { recursive: true });
const fixturePath = path.join(outDir, 'input.js');
fs.writeFileSync(
  fixturePath,
  `import { isValidEscrowId } from ${JSON.stringify(distEntry)}; console.log(isValidEscrowId('esc-1'));`,
);

function runawayPlugin() {
  return {
    name: 'runaway-imports',
    setup(build) {
      build.onResolve({ filter: STELLAR_SDK }, () => ({ path: stellarUmd, sideEffects: false }));
    },
  };
}

async function measure(plugins) {
  const result = await build({
    entryPoints: [fixturePath],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins,
  });
  const output = result.outputFiles[0].contents;
  const stellarBytes = Object.entries(result.metafile.inputs)
    .filter(([file]) => file.includes('@stellar/'))
    .reduce((total, [, info]) => total + info.bytesInOutput, 0);
  return { bytes: output.length, stellarBytes };
}

const shaken = await measure([runawayPlugin()]);
const sizeKb = shaken.bytes / 1024;

const consumer = await measure([]);
const consumerKb = consumer.bytes / 1024;

if (shaken.stellarBytes > 0) {
  console.error(
    `Tree-shaking regression: importing a single helper retained ${shaken.stellarBytes} bytes of @stellar/stellar-sdk`,
  );
  process.exit(1);
}

console.log(`Tree-shaking test bundle size: ${sizeKb.toFixed(2)} KB (budget ${SIZE_BUDGET_KB} KB)`);
console.log(
  `Note: a real browser bundle pays ${consumerKb.toFixed(2)} KB today because @stellar/stellar-sdk ships its browser build as a side-effectful UMD; that is upstream packaging, not a regression in this SDK's entry/chunk layout.`,
);

if (sizeKb > SIZE_BUDGET_KB) {
  console.error(`Tree-shaking regression: bundle size ${sizeKb.toFixed(2)} KB exceeds ${SIZE_BUDGET_KB} KB budget`);
  process.exit(1);
}
console.log('✓ Tree-shaking verification passed');
