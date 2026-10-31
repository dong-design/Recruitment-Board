const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extract}=require('../dashboard/link-utils');
test('extracts rich link objects, arrays, markdown and Chinese punctuation without unsafe schemes',()=>{
 assert.deepEqual(extract([{link:'https://example.com/apply',text:'投递'},'[官网](https://example.com/jobs)。','javascript:alert(1)',{url:'https://example.com/apply'}]),['https://example.com/apply','https://example.com/jobs']);
});
test('record transformation preserves rich hyperlinks and multiple entry points',()=>{
 const {transform}=require('../dashboard/server');
 const r=transform([{record_id:'recLink',fields:{'公司名称':'test','链接':{link:'https://example.com/apply',text:'官网'},'备注':'材料 https://example.com/file。'}}]).records[0];
 assert.equal(r.link,'https://example.com/apply');assert.deepEqual(r.urls,['https://example.com/apply','https://example.com/file']);
});
