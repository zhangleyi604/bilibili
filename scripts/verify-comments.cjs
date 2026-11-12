const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class E {
  constructor(){this.children=[];this.hidden=false;this.attributes={};this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){},contains:()=>false};this.events={};}
  append(...items){this.children.push(...items);}prepend(...items){this.children.unshift(...items);}replaceChildren(...items){this.children=[...items];}setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(e,f){this.events[e]=f;}getBoundingClientRect(){return {top:-300,bottom:-50,height:200,left:100};}scrollIntoView(){this.scrolled=true;}setPointerCapture(){}
}
(async()=>{
  const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new E());return els.get(id);};let prompts=0,sort='',observer,resize;
  const item={userId:'1',author:'A',level:'LV3',content:'Hello',sentAt:'2026-11-13T10:00:00',likes:2};
  const context={el,node:(t,c,text)=>Object.assign(new E(),{className:c,textContent:text}),link:(href,text,c)=>Object.assign(new E(),{href,textContent:text,className:c}),shortCount:String,card:()=>new E(),
    openLogin:()=>prompts++,api:async url=>{sort=url;return {total:20,items:[{...item,replyCount:8,replies:[item,item,item]},{...item,replyCount:0,replies:[]},item]};},
    document:{body:new E(),fullscreenElement:null,createElementNS:()=>new E(),querySelector:()=>new E(),addEventListener(){}},window:{innerWidth:1200,innerHeight:800,addEventListener(){}},
    ResizeObserver:class {constructor(fn){resize=fn;}observe(){}disconnect(){}},IntersectionObserver:class {constructor(fn){observer=fn;}observe(){}disconnect(){}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('src/main/resources/static/watch-comments.js','utf8'),context);
  await context.setupWatchComments('123');assert.equal(el('comment-list').children.length,2);assert.equal(el('comment-total').textContent,'20');
  const body=el('comment-list').children[0].children[1],replies=body.children[3];assert.equal(replies.children.length,3,'two previews plus login-gated view link');
  replies.children[2].onclick();assert.equal(prompts,1);body.children[2].children[1].onclick();assert.equal(prompts,2);
  const beforeSort=sort;el('comments-latest').onclick();assert.equal(prompts,3);assert.equal(sort,beforeSort,'guest click must not request latest comments');
  context.setupRelatedExpansion(Array.from({length:20},(_,i)=>({id:i})));assert.equal(el('related-videos').children.length,12);assert.equal(el('related-extra').children.length,8);
  el('related-expand').onclick();assert.equal(el('related-extra').hidden,false);el('related-collapse').onclick();assert.equal(el('related-extra').hidden,true);
  const shell=new E();shell.offsetWidth=360;shell.offsetHeight=203;context.setupWatchScroll(new E(),shell);
  observer([{isIntersecting:false,boundingClientRect:{top:-300}}]);assert.ok(context.document.body.children.includes(shell),'same player becomes floating');
  const handle=el('mini-drag-handle');handle.events.pointerdown({button:0,clientX:110,clientY:120,pointerId:1,preventDefault(){}});handle.events.pointermove({clientX:900,clientY:500});assert.equal(shell.style.left,'840px');
  el('mini-close').onclick();observer([{isIntersecting:true,boundingClientRect:{top:100}}]);
  console.log('PASS: two-comment/two-reply cap, login gates, sorting, recommendation expand/collapse, floating same player, drag boundary');
})().catch(e=>{console.error(e);process.exitCode=1;});
