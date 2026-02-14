import * as esbuild from 'esbuild'
import { rmSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
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

console.log('Bundled handler lambda')
