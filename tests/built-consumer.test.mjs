import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const compiler = join(root, 'node_modules/typescript/lib/tsc.js');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

test('packed libraries support external ESM + standard decorators, inheritance, and typed dispatch without aliases', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'incrementa-consumer-'));
  try {
    const artifacts = join(temporary, 'packages');
    await mkdir(artifacts);
    for (const name of ['core', 'engine', 'mechanics', 'decorators', 'runtime-local']) {
      run('pnpm', ['pack', '--pack-destination', artifacts], join(root, 'packages', name));
    }
    const tarballs = await readdir(artifacts);
    assert.equal(tarballs.length, 5);
    const dependencies = Object.fromEntries(tarballs.map(file => [`@incrementa/${file.replace('incrementa-', '').replace('-0.1.0.tgz', '')}`, `file:./packages/${file}`]));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'external-consumer', private: true, type: 'module', dependencies }));
    await writeFile(join(temporary, 'pnpm-workspace.yaml'), JSON.stringify({ overrides: dependencies }));
    // Uses cached dependency artifacts and the local tarballs; no publication or network access.
    run('pnpm', ['install', '--offline', '--ignore-scripts', '--lockfile=false', '--config.manage-package-manager-versions=false'], temporary);
    const source = await readFile(join(root, 'tests/consumer.ts'), 'utf8');
    await writeFile(join(temporary, 'consumer.ts'), source);
    await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitOverride: true,
      lib: ['ES2022', 'DOM', 'ESNext.Decorators'], types: [], outDir: 'dist',
    }, include: ['consumer.ts'] }));
    run(process.execPath, [compiler, '-p', 'tsconfig.json'], temporary);
    run(process.execPath, ['dist/consumer.js'], temporary);
    const badSource = source + `\nengine.dispatch(engine.createState(), 'gain', { amount: 1 });\nengine.dispatch(engine.createState(), 'not-registered', {});\n`;
    await writeFile(join(temporary, 'consumer.ts'), badSource);
    const invalid = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json', '--noEmit'], { cwd: temporary, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0, 'wrong action names and inputs must fail compilation');
    assert.match(invalid.stdout, /Type 'number' is not assignable to type 'string'/);
    assert.match(invalid.stdout, /not-registered/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
