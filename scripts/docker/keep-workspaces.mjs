// Used only inside the Docker build: reduce the monorepo to the given npm
// workspaces, e.g. `node keep-workspaces.mjs backend web`.
//
// Why: `npm ci` installs every package recorded in package-lock.json, so the
// server image would also get the iPhone app's dependencies (Expo, React
// Native: hundreds of MB). This script removes the other workspaces from
// package.json and keeps only the lockfile entries the remaining workspaces
// actually reach. Every kept package keeps its locked version, so the
// following `npm ci` stays reproducible. Development dependencies stay in
// the lockfile; `npm ci --omit=dev` skips them (it still needs to know them).
import { readFileSync, writeFileSync } from 'node:fs'

const keep = process.argv.slice(2)
if (keep.length === 0) throw new Error('Usage: node keep-workspaces.mjs <workspace>...')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const packages = lock.packages

/** Where npm finds `name` when required from the package at `fromPath` (Node's resolution). */
function resolve(fromPath, name) {
  let dir = fromPath
  while (true) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`
    if (packages[candidate]) return candidate
    if (!dir) return null
    const parent = dir.lastIndexOf('/node_modules/')
    dir = parent === -1 ? '' : dir.slice(0, parent)
  }
}

function dependencyNames(entry, includeDev) {
  // Optional peers (e.g. drizzle-orm lists every database driver it supports,
  // including expo-sqlite) are only used if something else installs them.
  const optionalPeers = new Set(
    Object.entries(entry.peerDependenciesMeta ?? {}).filter(([, meta]) => meta.optional).map(([name]) => name),
  )
  const requiredPeers = Object.keys(entry.peerDependencies ?? {}).filter((name) => !optionalPeers.has(name))
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
    ...requiredPeers,
    ...(includeDev ? Object.keys(entry.devDependencies ?? {}) : []),
  ]
}

// Walk from the kept workspaces (and the root) through their dependencies.
const reachable = new Set([''])
const queue = keep.map((ws) => [ws, true])
queue.push(['', true])
while (queue.length > 0) {
  const [path, includeDev] = queue.shift()
  reachable.add(path)
  const entry = packages[path]
  if (!entry) continue
  if (entry.link && entry.resolved && !reachable.has(entry.resolved)) queue.push([entry.resolved, includeDev])
  for (const name of dependencyNames(entry, includeDev)) {
    const target = resolve(path, name)
    // Dependencies of dependencies never need their devDependencies.
    if (target && !reachable.has(target)) queue.push([target, false])
  }
}

// npm also records a symlink node_modules/<name> -> <workspace> for each workspace.
for (const [path, entry] of Object.entries(packages)) {
  if (entry.link && keep.includes(entry.resolved)) reachable.add(path)
}

const before = Object.keys(packages).length
for (const path of Object.keys(packages)) {
  if (!reachable.has(path)) delete packages[path]
}
pkg.workspaces = keep
packages[''].workspaces = keep

writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
console.log(`workspaces: ${keep.join(', ')}; lockfile entries: ${before} -> ${Object.keys(packages).length}`)
