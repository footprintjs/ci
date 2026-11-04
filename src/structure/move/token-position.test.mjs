import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { tokenPrefixCount } from './token-position.mjs';

test('token prefix boundaries preserve strict starts and inclusive ends in contextual syntax',()=>{
  const source=parseSource({path:'src/a.tsx',text:'const view=<p>{`before${/[/]/.test(value)}after`}</p>;'});
  for(const token of source.tokens){
    for(const position of [token.start,token.end]){
      assert.equal(tokenPrefixCount(source.tokens,position,'start'),source.tokens.filter(item=>item.start<position).length);
      assert.equal(tokenPrefixCount(source.tokens,position,'end'),source.tokens.filter(item=>item.end<=position).length);
    }
  }
});
