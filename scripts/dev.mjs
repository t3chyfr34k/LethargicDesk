import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const radicalePython = path.join(root, '.radicale-venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const radicaleConfig = path.join(root, '.radicale-data', 'config')
const children = []
let shuttingDown = false
let viteServer

function launch(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  children.push({ label, child })
  child.on('error', error => {
    console.error(`[${label}] Could not start: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${label}] stopped${signal ? ` (${signal})` : ` (exit ${code ?? 0})`}`)
      shutdown(code && code !== 0 ? code : 0)
    }
  })
  return child
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  await viteServer?.close()
  setTimeout(() => process.exit(exitCode), 500)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))

async function main() {
  viteServer = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '0.0.0.0' } })
  await viteServer.listen()
  viteServer.printUrls()

  if (existsSync(radicalePython) && existsSync(radicaleConfig)) {
    const localUrl = viteServer.resolvedUrls?.local?.[0]
    if (!localUrl) throw new Error('Vite did not report a local URL for the Radicale CORS configuration.')
    const origin = new URL(localUrl).origin
    const config = await readFile(radicaleConfig, 'utf8')
    if (!/^Access-Control-Allow-Origin\s*=\s*.+$/m.test(config)) {
      throw new Error('Radicale config is missing Access-Control-Allow-Origin.')
    }
    await writeFile(radicaleConfig, config.replace(/^Access-Control-Allow-Origin\s*=.*$/m, `Access-Control-Allow-Origin = ${origin}`), 'utf8')
    console.log(`[Radicale] Starting local CalDAV server for ${origin} on 127.0.0.1:5232`)
    launch('Radicale', radicalePython, ['-m', 'radicale', '--config', radicaleConfig])
  } else {
    console.log('[Radicale] Not set up yet. Run `npm run setup:radicale` to enable local CalDAV hosting.')
  }
}

main().catch(error => {
  console.error(`[Lethargic Desk] ${error instanceof Error ? error.message : String(error)}`)
  void shutdown(1)
})
