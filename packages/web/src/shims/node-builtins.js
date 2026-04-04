// Stubs for Node.js builtins imported by SDK modules (distributor, cache)
// that are pulled in via the barrel export but never called in the browser.
export const readFileSync = () => { throw new Error('Not available in browser'); };
export const dirname = () => '';
export const join = (...args) => args.join('/');
export const fileURLToPath = (url) => url;
export const createHash = () => ({ update: () => ({ digest: () => '' }) });
export default {};
