import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const output=await build({entryPoints:[fileURLToPath(new URL('../src/sync-metrics.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})
const {syncMetrics}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'))
try{await syncMetrics(process.env)}catch(error){console.error(error instanceof Error?error.message:'metrics synchronization failed');process.exitCode=1}
