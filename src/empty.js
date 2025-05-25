// empty shim for browser
// fs
export default {};
export const promises = {};
export function createReadStream() {}
// path
export function join() {}
export function resolve() {}
export function dirname() {}
// crypto
export function createHash() { return { update: () => ({ digest: () => '' }) }; }
// os
export function homedir() { return ''; }
