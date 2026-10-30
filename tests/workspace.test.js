const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('../dashboard/workspace-engine');
test('calendar parses multiple dates and times without inventing a time for undated text',()=>{
  const dates=W.dates('面试 2026年11月1日 09:00-10:00；二面 2026/11/3 待定');
  assert.deepEqual(dates,[{date:'2026-11-01',time:'09:00',end:'10:00'},{date:'2026-11-03',time:'',end:''}]);
  assert.equal(W.dates('2026-02-30 10:00').length,0);
});
test('calendar warns on interval overlap and equal starts, not adjacent or unknown appointments',()=>{
  const input=['09:00-10:00','09:30-10:30','10:30-11:00','待定'].map((t,i)=>({id:String(i),name:'test',exam:'2026-11-01 '+t}));
  assert.deepEqual(W.events(input).map(e=>e.conflict),[true,true,false,false]);
});
test('global search includes child parent, city and role; quick filters have bounded dates',()=>{
  const r={name:'北京分行',parent:'中国银行',post:'科技岗',city:['北京'],status:'待投递',key:'2026-11-03',hasDl:true};
  assert.equal(W.matches(r,'中国银行 北京 科技','deadline','2026-11-01'),true);
  assert.equal(W.matches(r,'','deadline','2026-11-04'),false);
  assert.equal(W.matches({...r,status:'已投递'},'','deadline','2026-11-01'),false);
});
test('quick links reject script protocols and deduplicate urls',()=>{
  const links=W.links({link:'javascript:alert(1)',note:'https://example.com/exam https://example.com/exam'});
  assert.equal(links.length,1);assert.equal(links[0].label,'考试链接');
});
test('daily action retains past exams and deadlines and applies persisted completion',()=>{
  const now=Date.parse('2026-11-01T08:00:00+08:00');
  const r={id:'r1',name:'银行',status:'待投递',hasDl:true,key:'2026-10-31',exam:'2026-10-30 09:00'};
  const list=W.focus([r],[],{marks:{'exam:r1:2026-10-30':{done:true}}},[],now);
  assert.equal(list.length,2);assert.ok(list.every(t=>t.group==='overdue'));assert.ok(list.find(t=>t.done));
});
test('completed application remains visible after its pending deadline disappears',()=>{
  const state={marks:{'deadline:recA:2026-11-01:0':{done:true,snoozeUntil:0,snapshot:{rid:'recA',title:'银行',kind:'截止提醒',date:'2026-11-01',detail:'已确认完成投递'}}}};
  const list=W.focus([{id:'recA',status:'已投递'}],[],state,[],Date.parse('2026-11-01T08:00:00+08:00'));
  assert.equal(list.length,1);assert.equal(list[0].done,true);assert.equal(list[0].rid,'recA');
});
test('completion snapshot persists across restart and rejects malformed summaries',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {createStore}=require('../dashboard/planner-store');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-'));
  try{
    const file=path.join(dir,'state.json'),store=createStore(file);
    const snapshot={rid:'recA',title:'银行',kind:'截止提醒',date:'2026-11-01',detail:'已确认完成投递'};
    store.update({action:'mark',id:'deadline:recA',done:true,snoozeUntil:0,snapshot});
    assert.deepEqual(createStore(file).read().marks['deadline:recA'].snapshot,snapshot);
    assert.throws(()=>store.update({action:'mark',id:'bad',done:true,snoozeUntil:0,snapshot:{}}));
  }finally{fs.rmSync(dir,{recursive:true});}
});
