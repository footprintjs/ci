import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {isOpaqueCredential} from '../src/http-credential.cjs';
const credentialPreflight = await readFile('bin/caller-preflight.cjs', 'utf8');
// Pre-checkout code stays dependency-free; its embedded validator must equal
// the shared source used by the bundled and unbundled adapters.
if (!credentialPreflight.includes(isOpaqueCredential.toString())) throw new Error('caller-credential-binding-drift');
const npmPayload = await readFile('vendor/npm/npm-11.19.0.tgz');
const npmManifestBytes = await readFile('vendor/npm/manifest.json');
const npmManifest = JSON.parse(npmManifestBytes);
const npmDigest = createHash('sha256').update(npmPayload).digest('hex');
if (npmManifest.name !== 'npm' || npmManifest.version !== '11.19.0' || npmManifest.sha256 !== npmDigest) throw new Error('publisher-vendor-integrity');
/** Both committed programs close runtime imports. The target checkout never
 * supplies engine dependencies or an install step for control execution. */
async function emit({entryPoint,outfile,metadataPath,mode,extra={}}) {
 const result = await build({ entryPoints: [entryPoint], bundle: true, platform: 'node', target: 'node22',
  format: 'cjs', outfile, write: false, metafile: true, legalComments: 'eof', logLevel: 'silent' });
 const bytes=result.outputFiles[0].contents;
 const inputs=Object.entries(result.metafile.inputs).map(([path,value])=>({path,bytes:value.bytes})).sort((a,b)=>a.path.localeCompare(b.path));
 const external=Object.values(result.metafile.outputs).flatMap(value=>value.imports).filter(value=>value.external).map(value=>value.path);
 if(external.some(value=>!value.startsWith('node:')))throw new Error('bundle-external-dependency');
 await mkdir('dist',{recursive:true});await writeFile(outfile,bytes,{mode});
 await writeFile(metadataPath,JSON.stringify({schemaVersion:1,format:'cjs',target:'node22',
  sha256:createHash('sha256').update(bytes).digest('hex'),inputs,...extra,external:[...new Set(external)].sort()},null,2)+'\n');
}
await emit({entryPoint:'bin/release.mjs',outfile:'dist/release.cjs',metadataPath:'dist/build-metadata.json',mode:0o755,
 extra:{publisherPayload:{path:'vendor/npm/npm-11.19.0.tgz',version:'11.19.0',sha256:npmDigest,bytes:npmPayload.length,boundToShadow:false}}});
await emit({entryPoint:'src/propose/proposal-bootstrap.mjs',outfile:'dist/propose.cjs',metadataPath:'dist/propose-metadata.json',mode:0o644,
 extra:{purpose:'proposal-bootstrap-inputs-only',writerAuthority:false}});

await emit({entryPoint:'src/propose/writer-program.mjs',outfile:'dist/propose-writer.cjs',metadataPath:'dist/propose-writer-metadata.json',mode:0o644,
 extra:{purpose:'native-proposal-writer',writerAuthority:false,releaseReady:false}});
