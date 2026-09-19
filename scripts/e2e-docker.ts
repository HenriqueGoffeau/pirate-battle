import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8')) as { version: string }
const image = `mcr.microsoft.com/playwright:v${version}-noble`
const playwrightArgs = process.argv.slice(2).join(' ')

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host',
    '-e',
    'CI=1',
    '-v',
    `${process.cwd()}:/work`,
    '-v',
    'pirate-battle-e2e-modules:/work/node_modules',
    '-w',
    '/work',
    image,
    'bash',
    '-c',
    `npm ci --no-audit --no-fund && npx playwright test ${playwrightArgs}`,
  ],
  { stdio: 'inherit' },
)

process.exit(result.status ?? 1)
