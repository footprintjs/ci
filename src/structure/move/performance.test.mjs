import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { wholeUnits } from './units.mjs';
import { matchUnits } from './match.mjs';
import { bindingOwner } from './binding-owner.mjs';

test('comment ownership uses a bounded inventory instead of a statement scan per unit/comment pair',()=>{
  const size=50;
  const source=parseSource({path:'src/a.ts',text:Array.from({length:size},(_,i)=>`/** Doc ${i}. */\nfunction work${i}(){return ${i};}`).join('\n')});
  let starts=0;
  for(const statement of source.sourceFile.statements){
    const original=statement.getStart;
    statement.getStart=function(...args){starts+=1;return original.apply(this,args);};
  }
  const units=wholeUnits(source,new Map());
  assert.equal(units.length,size);
  assert.equal(units.reduce((sum,unit)=>sum+unit.comments.length,0),size);
  assert.ok(starts<=size*20,`statement-start observations ${starts} exceed bounded inventory`);
});

test('matching unique retained units uses bounded path admission while preserving every pair',()=>{
  const size=200;
  let reads=0;
  const base={units:Array.from({length:size},(_,i)=>({path:`src/${i}.ts`,key:`unit:${i}`}))};
  const head={units:base.units.map(unit=>({get path(){reads+=1;return unit.path;},key:unit.key}))};
  const result=matchUnits(base,head);
  assert.equal(result.pairs.length,size);
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(result.unverified,[]);
  assert.ok(reads<=size*20,`path observations ${reads} exceed bounded admission`);
});

test('repeated lexical parameter ownership avoids rescanning all tokens per reference',()=>{
  const source=parseSource({path:'src/a.ts',text:`function work(value){${'value;'.repeat(1500)}return value;}`});
  const [unit]=wholeUnits(source,new Map());
  assert.ok(unit,'missing whole function');
  const tokens=unit.tokens;let reads=0;
  unit.tokens=new Proxy(tokens,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads+=1;return Reflect.get(target,key,receiver);}});
  const context={byNode:new Map([[unit.node,unit]])};
  const refs=[];
  const visit=node=>{if(ts.isIdentifier(node)&&node.text==='value'&&ts.isExpressionStatement(node.parent))refs.push(node);ts.forEachChild(node,visit);};
  visit(unit.node);
  const owners=refs.slice(0,64).map(node=>bindingOwner(node,context,unit,new Map([[unit,'stable']])));
  assert.ok(owners.every(owner=>JSON.stringify(owner)===JSON.stringify(owners[0])));
  assert.ok(owners[0],'missing lexical parameter owner');
  assert.ok(reads<=tokens.length+owners.length*32,`token observations ${reads} exceed indexed lookup`);
});
