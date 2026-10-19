// Stages the browser demo for static hosting: the built library plus examples/browser, laid out
// as in the repo so the demo's "../../dist/index.js" import still resolves. The site root
// redirects to the demo.
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';

const out = '.demo';
rmSync(out, {recursive: true, force: true});
mkdirSync(`${out}/examples`, {recursive: true});
cpSync('dist', `${out}/dist`, {recursive: true});
cpSync('examples/browser', `${out}/examples/browser`, {recursive: true});
writeFileSync(`${out}/_redirects`, '/ /examples/browser/ 302\n');
console.log(`staged ${out}/`);
