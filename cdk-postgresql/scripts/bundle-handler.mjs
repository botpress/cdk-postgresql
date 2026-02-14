import * as esbuild from 'esbuild'
import { rmSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const outdir = resolve(__dirname, '..', 'lib', 'handler-bundle')

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

await esbuild.build({
  entryPoints: [resolve(__dirname, '..', 'lib', 'handler.ts')],
  outfile: resolve(outdir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['@aws-sdk/*'],
  minify: true,
  sourcemap: true,
})

// pg-format uses require(__dirname + '/reserved.js') which esbuild can't resolve statically.
// Copy it alongside the bundle so the runtime require works.
const pgFormatDir = dirname(require.resolve('pg-format'))
copyFileSync(resolve(pgFormatDir, 'reserved.js'), resolve(outdir, 'reserved.js'))

console.log('Bundled handler lambda')
