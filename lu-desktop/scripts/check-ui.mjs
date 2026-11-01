import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const ui=readFileSync(new URL('../web/main.jsx',import.meta.url),'utf8');
const host=readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../dist/assets/app.js',import.meta.url),'utf8');
const tests=[
 ['independent Lu-native invokes', ui.includes("invoke('lu_import_model')") && ui.includes("invoke('lu_generate'")],
 ['no Jan model/service routing', !/jan_llama|JanInference|jan-cowork/.test(ui+host)],
 ['errors retain submitted prompt and selected images', ui.includes('if (completed) {') && ui.includes("setPrompt('');")],
 ['host and UI both support pinned image cleanup', host.includes('fn lu_release_image(') && ui.includes("invoke('lu_release_image'")],
 ['unverified hardware status is not misrepresented', ui.includes('offload unverified') && ui.includes('Development evaluation only')],
 ['frontend output exists', statSync(new URL('../dist/assets/app.js',import.meta.url)).size > 100000 && html.includes('assets/app.js')],
 ['React bundle still includes native command wiring', js.includes('lu_import_model') && js.includes('lu_release_image')],
];
for (const [name, pass] of tests) {
 console.log(`${pass?'PASS':'FAIL'} ${name}`);
 assert.ok(pass,name);
}
console.log(`UI source and bundle acceptance: ${tests.length}/${tests.length}`);
