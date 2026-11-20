const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const classes = new Set(), events = {}, timers = new Map();
let sequence = 0, panelOpen = false, scrubActive = false;
const shell = {
  classList: { add:c=>classes.add(c), remove:(...names)=>names.forEach(c=>classes.delete(c)), contains:c=>classes.has(c) },
  // The collection panel always exists, even when CSS hides it.
  querySelectorAll:selector=>selector === '.hover-panel' || scrubActive ? [{}] : [],
  addEventListener:(name, callback)=>events[name]=callback
};
const context = {
  getComputedStyle:()=>({display:"block", visibility:panelOpen?"visible":"hidden", opacity:panelOpen?"1":"0"}),
  setTimeout:(fn,delay)=>{assert.equal(delay,2000);timers.set(++sequence,fn);return sequence;},
  clearTimeout:id=>timers.delete(id), window:{addEventListener(){}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/main/resources/static/watch.js','utf8'),context);
const wake = context.setupPlayerControlsIdle(shell);
function expire(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}
events.pointerenter();expire();assert.ok(classes.has('controls-idle'),'normal mode goes idle while the pointer stays inside');
events.pointermove();assert.ok(!classes.has('controls-idle'));
scrubActive=true;expire();assert.ok(!classes.has('controls-idle'),'active seeking keeps controls visible');scrubActive=false;
classes.add('fullscreen-layout');wake();expire();assert.ok(classes.has('fullscreen-idle'),'fullscreen goes idle after 2s');
events.pointermove();assert.ok(!classes.has('fullscreen-idle'),'movement reveals controls');
panelOpen=true;expire();assert.ok(!classes.has('fullscreen-idle'),'menu interaction keeps controls visible');assert.equal(timers.size,1);
panelOpen=false;expire();assert.ok(classes.has('fullscreen-idle'),'controls hide after menu interaction ends');
events.keydown();assert.ok(!classes.has('fullscreen-idle'),'keyboard interaction reveals controls');
classes.delete('fullscreen-layout');wake();assert.equal(timers.size,1);assert.ok(!classes.has('fullscreen-idle'),'fullscreen exit restores normal controls');
classes.add('scroll-mini');wake();assert.equal(timers.size,0,'small window keeps its own controls');
console.log('PASS: fullscreen idle delay, pointer and keyboard wake, open menu protection, normal mode and fullscreen exit');
