import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { withReplayStore } from './store.mjs';
import { repository } from './testing.fixture.mjs';
import { execFileSync } from 'node:child_process';

test('replay writes only owned temporary objects and removes its store on return or failure',t=>{
  const {path,git}=repository(t);
  const before=git('count-objects','-v'),refs=git('show-ref');
  let observed;
  const value=withReplayStore(path,40,store=>{
    observed=store;
    assert.equal(existsSync(store),true);
    const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_')));
    Object.assign(env,{GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'});
    const oid=execFileSync('git',['-C',store,'hash-object','-w','--stdin'],{env,input:'owned new blob\n',encoding:'utf8'}).trim();
    assert.equal(existsSync(`${store}/objects/${oid.slice(0,2)}/${oid.slice(2)}`),true);
    return 'observed';
  });
  assert.equal(value,'observed');assert.equal(existsSync(observed),false);
  assert.throws(()=>withReplayStore(path,40,store=>{observed=store;throw new Error('owned failure');}),/owned failure/);
  assert.equal(existsSync(observed),false);
  assert.equal(git('count-objects','-v'),before);assert.equal(git('show-ref'),refs);
});
