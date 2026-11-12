function setupWatchPreferences(player, { read, save, notice }) {
  const dmDefaults = { scroll:true, fixed:true, color:true, advanced:true, scale:false, subtitleSafe:false, smart:true, area:100, opacity:80, size:100, speed:3, density:'normal', keywords:[], syncRate:false, font:'heiti', bold:false, outline:'heavy' };
  const dm = { ...dmDefaults, ...read('bili-danmaku-settings', {}) };
  const playback = { next:true, ratio:'auto', audio:'off', hideBars:false, lights:false, nativePip:true, ...read('bili-more-playback', {}) };
  let audioContext, compressor, source;
  function applyDm() {
    for (const key of ['scroll','fixed','color','advanced']) el('dm-filter-' + key).setAttribute('aria-pressed', String(dm[key]));
    for (const [key,id] of [['scale','dm-scale'],['subtitleSafe','dm-subtitle-safe'],['smart','dm-smart']]) el(id).checked = dm[key];
    for (const key of ['area','opacity','size','speed']) { el('dm-' + key).value = dm[key]; el('dm-' + key + '-value').textContent = key === 'speed' ? ['很慢','较慢','适中','较快','很快'][dm.speed - 1] : dm[key] + '%'; }
    for (const value of ['normal','more','overlap']) el('dm-density-' + value).setAttribute('aria-pressed', String(dm.density === value));
    el('dm-sync-rate').checked = dm.syncRate; el('dm-font').value = dm.font; el('dm-bold').checked = dm.bold;
    for (const value of ['heavy','stroke','shadow']) el('dm-outline-' + value).setAttribute('aria-pressed', String(dm.outline === value));
    el('danmaku-overlay').dataset.font = dm.font; el('danmaku-overlay').dataset.bold = String(dm.bold); el('danmaku-overlay').dataset.outline = dm.outline;
    el('dm-keywords').value = dm.keywords.join('\n');
    const bottom = dm.subtitleSafe ? 26 : dm.smart ? 18 : 8;
    el('danmaku-overlay').setAttribute('style', 'bottom:' + bottom + '%;height:' + Math.min(dm.area * .85, 99 - bottom) + '%;top:1%;opacity:' + dm.opacity/100);
    save('bili-danmaku-settings', dm);
  }
  for (const key of ['scroll','fixed','color','advanced']) el('dm-filter-' + key).onclick = () => { dm[key] = !dm[key]; applyDm(); if (key === 'scroll' && !dm.scroll) el('danmaku-overlay').replaceChildren(); };
  for (const [key,id] of [['scale','dm-scale'],['subtitleSafe','dm-subtitle-safe'],['smart','dm-smart']]) el(id).onchange = e => { dm[key] = e.target.checked; applyDm(); };
  for (const key of ['area','opacity','size','speed']) el('dm-' + key).oninput = e => { dm[key] = Number(e.target.value); applyDm(); };
  for (const value of ['normal','more','overlap']) el('dm-density-' + value).onclick = () => { dm.density = value; applyDm(); };
  function advanced() { el('dm-settings-main').hidden = true; el('dm-settings-advanced').hidden = false; el('danmaku-control').dataset.open = 'true'; }
  el('dm-advanced-open').onclick = advanced;
  el('dm-keywords-open').onclick = () => { el('dm-settings-main').hidden = true; el('dm-settings-advanced').hidden = true; el('dm-settings-keywords').hidden = false; el('danmaku-control').dataset.open = 'true'; };
  el('dm-keywords-back').onclick = () => { el('dm-settings-main').hidden = false; el('dm-settings-keywords').hidden = true; };
  el('dm-sync-rate').onchange = e => { dm.syncRate = e.target.checked; applyDm(); };
  el('dm-font').onchange = e => { dm.font = e.target.value; applyDm(); };
  el('dm-bold').onchange = e => { dm.bold = e.target.checked; applyDm(); };
  for (const outline of ['heavy','stroke','shadow']) el('dm-outline-' + outline).onclick = () => { dm.outline = outline; applyDm(); };
  el('dm-advanced-back').onclick = () => { el('dm-settings-main').hidden = false; el('dm-settings-advanced').hidden = true; };
  el('dm-keywords-save').onclick = () => { dm.keywords = el('dm-keywords').value.split('\n').map(s => s.trim()).filter(Boolean); applyDm(); el('dm-keywords-back').onclick(); el('danmaku-overlay').replaceChildren(); };
  el('dm-reset').onclick = () => { Object.assign(dm, dmDefaults, { keywords:[] }); applyDm(); };
  el('danmaku-settings').onclick = () => el('danmaku-control').dataset.open = el('danmaku-control').dataset.open === 'true' ? 'false' : 'true';
  el('danmaku-control').addEventListener('mouseleave', () => el('danmaku-control').dataset.open = 'false');
  applyDm();
  function applyPlayback() {
    el('mode-next').setAttribute('aria-pressed', String(playback.next)); el('mode-pause').setAttribute('aria-pressed', String(!playback.next)); el('autoplay-next').checked = playback.next;
    for (const ratio of ['auto','4','16']) el('ratio-' + ratio).setAttribute('aria-pressed', String(playback.ratio === ratio));
    for (const audio of ['standard','dynamic','off']) el('audio-' + audio).setAttribute('aria-pressed', String(playback.audio === audio));
    for (const [key,id] of [['hideBars','hide-bars'],['lights','lights-off'],['nativePip','native-pip']]) el(id).checked = playback[key];
    player.dataset.ratio = playback.ratio; player.dataset.hideBars = String(playback.hideBars);
    document.body.classList.toggle('watch-lights-off', playback.lights);
    save('bili-more-playback', playback);
  }
  for (const mode of ['next','pause']) el('mode-' + mode).onclick = () => { playback.next = mode === 'next'; applyPlayback(); };
  el('autoplay-next').onchange = e => { playback.next = e.target.checked; applyPlayback(); };
  for (const ratio of ['auto','4','16']) el('ratio-' + ratio).onclick = () => { playback.ratio = ratio; applyPlayback(); };
  for (const [key,id] of [['hideBars','hide-bars'],['lights','lights-off'],['nativePip','native-pip']]) el(id).onchange = e => { playback[key] = e.target.checked; applyPlayback(); };
  for (const mode of ['standard','dynamic','off']) el('audio-' + mode).onclick = async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return notice('当前浏览器不支持音量均衡');
      if (!audioContext) { audioContext = new Audio(); source = audioContext.createMediaElementSource(player); compressor = audioContext.createDynamicsCompressor(); }
      await audioContext.resume(); source.disconnect(); compressor.disconnect();
      if (mode === 'off') source.connect(audioContext.destination);
      else { compressor.threshold.value = mode === 'standard' ? -24 : -12; compressor.ratio.value = mode === 'standard' ? 8 : 2; compressor.knee.value = 20; source.connect(compressor); compressor.connect(audioContext.destination); }
      playback.audio = mode; applyPlayback();
    } catch { notice('音量均衡暂时不可用'); }
  };
  // Audio processing needs a user gesture; do not claim a saved mode is active before activation.
  playback.audio = 'off'; applyPlayback();
  return {
    allows: d => dm.scroll,
    decorate: (line, d) => { line.setAttribute('style', 'top:' + (Number(d.id) % 5) * 18 + '%;font-size:' + (dm.scale ? dm.size * .022 : dm.size * .22) + (dm.scale ? 'cqw' : 'px') + ';animation-duration:' + ((14 - dm.speed*2) / (dm.syncRate ? player.playbackRate || 1 : 1)) + 's'); },
    limit: () => dm.density === 'normal' ? 3 : dm.density === 'more' ? 6 : 12,
    nativePip: () => playback.nativePip,
  };
}
