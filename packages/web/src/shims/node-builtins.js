// Stubs for Node.js builtins imported by SDK modules (distributor, cache,
// retroactive re-apply) that are pulled in via the barrel export but never
// called in the browser. Phase 2 loops use fs/promises + readline for
// append-only file rewrites; those paths are Node-only.
const unavailable = () => { throw new Error('Not available in browser'); };

export const readFileSync = unavailable;
export const createReadStream = unavailable;
export const dirname = () => '';
export const join = (...args) => args.join('/');
export const fileURLToPath = (url) => url;
export const createHash = () => ({ update: () => ({ digest: () => '' }) });

// fs/promises
export const open = unavailable;
export const rename = unavailable;
export const stat = unavailable;
export const unlink = unavailable;

// readline
export const createInterface = unavailable;

export default {};
