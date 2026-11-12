const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.style = {}; this.hidden = false; this.value = 0; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.classes=new Set(); this.classList = { add:v=>this.classes.add(v), remove:v=>this.classes.delete(v), contains:v=>this.classes.has(v), toggle:(v,force)=>{const next=force===undefined?!this.classes.has(v):force;next?this.classes.add(v):this.classes.delete(v);return next;} }; }
  after() {}
  contains() { return false; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
  emit(event) { (this.listeners[event] || []).forEach(fn => fn()); }
  setAttribute(k,v) { this.attributes[k] = v; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return {left:100,top:100,width:500,height:281,bottom:125}; }
}
async function setup(storage = new Map(), collection = {title:null,items:[]}) {
  const elements = new Map(); const el = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  const p = el('player'); Object.assign(p,{ currentTime:0, duration:100, readyState:4, paused:true, ended:false, seeking:false, pause(){this.paused=true;this.emit('pause');}, async play(){this.paused=false;this.emit('play');} });
  el('login-dialog').open = false;
  let now = 0, tick, prompts = 0, copied = ''; const documentEvents={};
  const context = { startViewerPresence(){}, el, path:'/video/10001', duration:n=>`${Math.floor(n/60)}`.padStart(2,'0')+':'+`${n%60}`.padStart(2,'0'), shortCount:String,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}, performance:{now:()=>now},
    setInterval:fn=>(tick=fn,1),clearInterval(){},setTimeout(){return 1;},clearTimeout(){},
    window:{addEventListener(){}}, navigator:{clipboard:{writeText:async text=>{copied=text;}}}, document:{ documentElement:{clientWidth:1200}, body:new Element(), title:'', activeElement:{tagName:'BODY'}, addEventListener(event,fn){(documentEvents[event] ||= []).push(fn);},querySelector:()=>new Element() },
    openLogin:()=>{prompts++;el('login-dialog').open=true;},location:{assign(){}},
    node:(tag,cls,text)=>Object.assign(new Element(),{className:cls,textContent:text}),link:()=>new Element(),card:()=>new Element(),
    api:async url=> url.endsWith('/collection')?collection:url.endsWith('/engagement')?{like:3,coin:4,favorite:5,share:6}:url.endsWith('/danmaku')?[
      {id:'1',userId:'7',content:'A',timestamp:2,sentAt:'2026-11-12T12:00:00'}, {id:'2',userId:'7',content:'B',timestamp:3,sentAt:'2026-11-12T12:01:00'}, {id:'3',userId:'8',content:'C',timestamp:4,sentAt:'2026-11-12T12:02:00'}
    ]:url.startsWith('/authors/')?{followers:10}:url.startsWith('/videos?')?{items:[]}: {video:{id:'10001',title:'Test',authorId:'1',streamUrl:'/test.mp4',plays:1,danmaku:3},tags:[]}
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync('src/main/resources/static/watch-sidebar.js','utf8'),context);vm.runInContext(fs.readFileSync('src/main/resources/static/watch-preferences.js','utf8'),context);vm.runInContext(fs.readFileSync('src/main/resources/static/watch.js','utf8'),context);await context.loadWatchPage();
  return {el,p,storage,copied:()=>copied,fullscreen:flag=>{context.document.fullscreenElement=flag?el('player-shell'):null;(documentEvents.fullscreenchange||[]).forEach(fn=>fn());}, advance(ms,move=true){now+=ms;if(move&&!p.paused)p.currentTime+=ms/1000;tick();},prompts:()=>prompts};
}
(async()=>{
  const t=await setup();
  t.p.pause();t.advance(5000);assert.equal(t.storage.has('bili-trial-v1:10001'),false,'pause does not count');
  await t.p.play();t.p.seeking=true;t.p.currentTime=80;t.advance(100);t.p.seeking=false;assert.equal(t.storage.has('bili-trial-v1:10001'),false,'seek does not count');
  for(let i=0;i<100;i++)t.advance(100);assert.ok(Math.abs(JSON.parse(t.storage.get('bili-trial-v1:10001'))-10)<0.01);
  t.p.readyState=2;t.advance(2000,false);t.p.readyState=4;
  assert.ok(JSON.parse(t.storage.get('bili-trial-v1:10001'))<10.01,'buffering does not count');
  for(let i=0;i<201;i++)t.advance(100);
  assert.equal(t.p.paused,true);assert.equal(t.prompts(),1);assert.equal(t.el('trial-ended').hidden,false);
  t.el('login-dialog').open=false;await t.el('play-toggle').onclick();assert.equal(t.p.paused,true);assert.equal(t.prompts(),2);
  const restored=await setup(t.storage);assert.equal(restored.p.paused,true);assert.equal(restored.el('trial-ended').hidden,false);
  let rows=t.el('danmaku-list').children;rows[0].children[3].onclick();rows=t.el('danmaku-list').children;
  assert.ok(rows[0].className.includes('blocked'));assert.ok(rows[1].className.includes('blocked'));assert.ok(!rows[2].className.includes('blocked'));
  rows[1].children[3].onclick();assert.ok(!t.el('danmaku-list').children[0].className.includes('blocked'));
  assert.equal(t.el('coin-count').textContent,'4');
  t.p.playbackRate=2;t.p.emit('ratechange');assert.equal(t.p.playbackRate,1,'speed locked without login');
  t.el('subtitle-settings-open').onclick();assert.equal(t.el('subtitle-settings').hidden,false,'subtitle settings available to guests');
  t.el('subtitle-size').value='large';t.el('subtitle-size').onchange();assert.equal(t.p.dataset.subtitleSize,'large');
  t.el('subtitle-reset').onclick();assert.equal(t.p.dataset.subtitleSize,'medium');
  t.el('auto-start').onchange({target:{checked:false}});const noAutoplay=await setup(t.storage);assert.equal(noAutoplay.el('auto-start').checked,false);
  t.el('mirror-toggle').onchange({target:{checked:true}});assert.ok(t.p.attributes.style.includes('scaleX(-1)'));
  t.el('loop-toggle').onchange({target:{checked:true}});assert.equal(t.p.loop,true);
  const collectionPage = await setup(new Map(), {title:'Test collection',plays:30,items:[{id:'10001',title:'First',duration:60},{id:'10002',title:'Second',duration:90}]});
  assert.equal(collectionPage.el('video-collection').hidden,false);assert.equal(collectionPage.el('collection-position').textContent,'(1/2)');
  assert.equal(collectionPage.el('collection-list').children.length,2);assert.equal(t.el('video-collection').hidden,true);
  t.el('dm-area').oninput({target:{value:50}});assert.ok(t.el('danmaku-overlay').attributes.style.includes('height:42.5%'));
  t.el('dm-opacity').oninput({target:{value:40}});assert.ok(t.el('danmaku-overlay').attributes.style.includes('opacity:0.4'));
  t.el('ratio-4').onclick();assert.equal(t.p.dataset.ratio,'4');
  t.el('mode-pause').onclick();assert.equal(t.el('autoplay-next').checked,false);
  const hover = await setup();hover.p.currentTime=2;hover.p.emit('timeupdate');
  const line = hover.el('danmaku-overlay').children[0];assert.ok(line);line.emit('mouseenter');
  assert.equal(hover.el('danmaku-actions').hidden,false);assert.equal(line.style.animationPlayState,'paused');
  hover.el('dm-action-like').onclick();assert.equal(hover.prompts(),1);hover.el('login-dialog').open=false;
  hover.el('dm-action-report').onclick();assert.equal(hover.prompts(),2);
  await hover.el('dm-action-copy').onclick();assert.equal(hover.copied(),'A');
  hover.el('dm-advanced-open').onclick();assert.equal(hover.el('dm-settings-advanced').hidden,false);
  hover.el('dm-bold').onchange({target:{checked:true}});assert.equal(hover.el('danmaku-overlay').dataset.bold,'true');
  hover.el('dm-font').onchange({target:{value:'songti'}});assert.equal(hover.el('danmaku-overlay').dataset.font,'songti');
  hover.el('dm-outline-shadow').onclick();assert.equal(hover.el('danmaku-overlay').dataset.outline,'shadow');
  hover.el('dm-reset').onclick();assert.equal(hover.el('danmaku-overlay').dataset.bold,'false');assert.equal(hover.el('danmaku-overlay').dataset.font,'heiti');
  const sender=hover.el('danmaku-list').children[0].children[3];sender.emit('mouseenter');assert.equal(hover.el('sender-tooltip').textContent,'屏蔽该弹幕的发送者');sender.onclick();
  const unblock=hover.el('danmaku-list').children[0].children[3];unblock.emit('mouseenter');assert.equal(hover.el('sender-tooltip').textContent,'取消屏蔽该弹幕的发送者');
  const event={preventDefault(){},stopPropagation(){}};
  hover.el('sidebar-view-block').onclick(event);assert.equal(hover.el('danmaku-sidebar-title').textContent,'屏蔽设定');
  hover.el('shield-input').value='test';hover.el('shield-add').onclick();assert.equal(hover.el('shield-rows').children.length,1);
  hover.el('shield-tab-regex').onclick();hover.el('shield-input').value='/First/';hover.el('shield-add').onclick();assert.equal(hover.el('shield-rows').children.length,1);
  hover.el('shield-enabled').onchange({target:{checked:false}});assert.equal(hover.el('shield-body').hidden,true);
  hover.el('shield-enabled').onchange({target:{checked:true}});assert.equal(hover.el('shield-body').hidden,false);
  hover.el('sidebar-view-advanced').onclick(event);assert.equal(hover.el('sidebar-advanced-view').hidden,false);
  hover.el('dm-keywords-open').onclick();assert.equal(hover.el('sidebar-block-view').hidden,false);assert.equal(hover.el('danmaku-sidebar-title').textContent,'屏蔽设定');
  hover.el('sidebar-view-list').onclick(event);assert.equal(hover.el('sidebar-list-view').hidden,false);
  assert.ok(hover.el('danmaku-overlay').attributes.style.includes('top:1%'));
  hover.fullscreen(true);assert.equal(hover.el('player-shell').classList.contains('fullscreen-layout'),true);
  assert.ok(hover.el('fullscreen-danmaku-slot').children.includes(hover.el('danmaku-compose')));
  hover.fullscreen(false);assert.equal(hover.el('player-shell').classList.contains('fullscreen-layout'),false);
  hover.el('web-fullscreen').onclick();assert.equal(hover.el('player-shell').classList.contains('fullscreen-layout'),true);
  hover.el('web-fullscreen').onclick();assert.equal(hover.el('player-shell').classList.contains('fullscreen-layout'),false);
  console.log('PASS: native/web fullscreen state and preserved composer');
  console.log('PASS: sidebar modes, keyword routing, text/regex rules, filter switch, near-top danmaku');
  console.log('PASS: floating danmaku toolbar, guest like/report gate, clipboard copy, advanced typography/reset, sender tooltips');
  console.log('PASS: conditional collection, active episode, danmaku area/opacity, aspect ratio, pause-after-play');
  console.log('PASS: guest speed restriction, subtitle preferences/reset, autoplay preference, mirror, loop');
console.log('PASS: cumulative trial, pause, buffering, seeking, cutoff, replay gate, reload persistence, sender blocking/unblocking, engagement binding');
})().catch(e=>{console.error(e);process.exitCode=1;});
