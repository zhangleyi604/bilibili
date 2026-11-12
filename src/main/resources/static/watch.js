async function loadWatchPage() {
  const player = el('player'), shell = el('player-shell');
  const id = path.split('/')[2];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const trialKey = 'bili-trial-v1:' + id;
  let watched = Math.max(0, Math.min(30, Number(read(trialKey, 0)) || 0));
  let blocked = new Set(read('bili-blocked-users', []));
  let danmaku = [], enabled = true, lastTick = performance.now(), lastVideoTime = 0, nextVideo = null, noticeTimer;
  const shown = new Set();
  const clock = (value) => duration(Math.floor(Number.isFinite(value) ? value : 0));
  const notice = (message) => { el('control-notice').textContent = message; el('control-notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el('control-notice').hidden = true, 2500); };
  let activeDanmaku = null, activeLine = null, actionTimer;
  function hideDanmakuActions() {
    el('danmaku-actions').hidden = true;
    if (activeLine) activeLine.style.animationPlayState = '';
    activeDanmaku = null; activeLine = null;
  }
  function showDanmakuActions(d, line) {
    clearTimeout(actionTimer);
    if (activeLine && activeLine !== line) activeLine.style.animationPlayState = '';
    activeDanmaku = d; activeLine = line; line.style.animationPlayState = 'paused';
    const rect = line.getBoundingClientRect(), frame = shell.getBoundingClientRect();
    const toolbar = el('danmaku-actions'); toolbar.hidden = false;
    const width = toolbar.offsetWidth || 150, height = toolbar.offsetHeight || 44;
    const left = Math.max(8, Math.min(rect.left - frame.left + rect.width / 2 - width / 2, frame.width - width - 8));
    const top = Math.max(8, Math.min(rect.bottom - frame.top + 10, frame.height - height - 8));
    toolbar.setAttribute('style', 'left:' + left + 'px;top:' + top + 'px');
  }
  function delayHideActions() { clearTimeout(actionTimer); actionTimer = setTimeout(hideDanmakuActions, 220); }
  el('danmaku-actions').addEventListener('mouseenter', () => clearTimeout(actionTimer));
  el('danmaku-actions').addEventListener('mouseleave', delayHideActions);
  el('danmaku-actions').addEventListener('focusin', () => clearTimeout(actionTimer));
  el('danmaku-actions').addEventListener('focusout', delayHideActions);
  el('dm-action-like').onclick = () => { if (activeDanmaku) openLogin(el('dm-action-like')); };
  el('dm-action-report').onclick = () => { if (activeDanmaku) openLogin(el('dm-action-report')); };
  el('dm-action-copy').onclick = async () => {
    if (!activeDanmaku) return;
    try { await navigator.clipboard.writeText(activeDanmaku.content); notice('弹幕已复制'); }
    catch { notice('复制失败，请检查浏览器剪贴板权限'); }
  };
  function showSenderTooltip(button, blocked) {
    const tip = el('sender-tooltip'), rect = button.getBoundingClientRect();
    tip.textContent = blocked ? '取消屏蔽该弹幕的发送者' : '屏蔽该弹幕的发送者';
    tip.hidden = false;
    tip.setAttribute('style', 'left:' + Math.max(145, Math.min(rect.left + rect.width / 2, document.documentElement.clientWidth - 145)) + 'px;top:' + (rect.top - 8) + 'px');
  }
  function gate(prompt = true) {
    hideDanmakuActions(); player.pause(); el('trial-ended').hidden = false; el('trial-tip').hidden = true;
    if (prompt && !el('login-dialog').open) openLogin(el('play-toggle'));
  }
  async function play() {
    if (watched >= 30) return gate();
    if (!player.paused) return player.pause();
    try { await player.play(); } catch (error) { if (error.name !== 'AbortError') notice('请点击播放；若无法播放，请检查视频文件'); }
  }
  el('play-toggle').onclick = play; el('big-play').onclick = play; el('mini-play-toggle').onclick = play; player.onclick = play;
  el('trial-start').onclick = play;
  el('close-trial').onclick = () => el('trial-tip').hidden = true;
  player.addEventListener('play', () => { if (watched >= 30) return gate(); lastTick = performance.now(); shell.dataset.playing = 'true'; el('play-toggle').dataset.playing = 'true'; el('big-play').hidden = true; shell.classList.remove('paused-danmaku'); });
  player.addEventListener('pause', () => { shell.dataset.playing = 'false'; el('play-toggle').dataset.playing = 'false'; el('big-play').hidden = false; shell.classList.add('paused-danmaku'); });
  // Count elapsed playing time, never the timeline position or the seek distance.
  const timer = setInterval(() => {
    const now = performance.now(), elapsed = (now - lastTick) / 1000; lastTick = now;
    if (!player.paused && !player.ended && !player.seeking && player.readyState >= 3 && player.currentTime !== lastVideoTime) {
      watched = Math.min(30, Math.max(watched, Number(read(trialKey, 0)) || 0) + Math.min(elapsed, Math.max(0, player.currentTime - lastVideoTime) / (player.playbackRate || 1)));
      save(trialKey, watched);
      if (watched >= 30) gate();
    }
    lastVideoTime = player.currentTime;
  }, 100);
  window.addEventListener('pagehide', () => { clearInterval(timer); save(trialKey, watched); }, { once: true });
  player.addEventListener('timeupdate', () => {
    el('play-time').textContent = clock(player.currentTime) + ' / ' + clock(player.duration);
    if (Number.isFinite(player.duration)) {
      el('seek').value = player.currentTime / player.duration * 100;
      el('seek').setAttribute('style', '--seek-progress:' + el('seek').value + '%');
    }
    if (enabled && !player.seeking) danmaku.filter(d => d.timestamp <= player.currentTime && d.timestamp > player.currentTime - 0.6 && !shown.has(d.id) && watchSidebar.allowed(d) && watchPreferences.allows(d)).slice(0, watchPreferences.limit()).forEach(d => {
      shown.add(d.id); const line = node('span', 'flying-danmaku', d.content); line.dataset.userId = d.userId; line.style.top = (Number(d.id) % 5) * 18 + '%'; watchPreferences.decorate(line, d);
      line.tabIndex = 0; line.setAttribute('aria-label', d.content + '，查看弹幕操作');
      line.addEventListener('mouseenter', () => showDanmakuActions(d, line)); line.addEventListener('focus', () => showDanmakuActions(d, line));
      line.addEventListener('mouseleave', delayHideActions); line.addEventListener('blur', delayHideActions);
      el('danmaku-overlay').append(line); line.addEventListener('animationend', () => { if (activeLine === line) hideDanmakuActions(); line.remove(); });
    });
  });
  player.addEventListener('loadedmetadata', () => { el('play-time').textContent = clock(player.currentTime) + ' / ' + clock(player.duration); });
  player.addEventListener('seeking', () => { hideDanmakuActions(); shown.clear(); el('danmaku-overlay').replaceChildren(); lastTick = performance.now(); });
  player.addEventListener('seeked', () => { lastVideoTime = player.currentTime; lastTick = performance.now(); });
  el('seek').oninput = () => { if (Number.isFinite(player.duration)) { player.currentTime = player.duration * el('seek').value / 100; el('seek').setAttribute('style', '--seek-progress:' + el('seek').value + '%'); } };
  el('playback-rate').onclick = () => { el('speed-control').dataset.open = el('speed-control').dataset.open === 'true' ? 'false' : 'true'; };
  player.addEventListener('ratechange', () => { if (player.playbackRate !== 1) player.playbackRate = 1; });
  el('volume').oninput = e => { player.volume = Number(e.target.value); player.muted = false; el('volume-value').textContent = Math.round(player.volume * 100); };
  player.addEventListener('volumechange', () => { el('mute-toggle').dataset.muted = String(player.muted || player.volume === 0); el('mute-toggle').setAttribute('aria-label', player.muted ? '取消静音' : '静音'); el('volume-value').textContent = player.muted ? '0' : Math.round(player.volume * 100); el('volume').value = player.muted ? 0 : player.volume; });
  el('mute-toggle').onclick = () => { player.muted = !player.muted; el('mute-toggle').dataset.muted = String(player.muted); };
  el('quality').onclick = () => notice('当前播放原始文件，暂无其他清晰度');
  for (const [trigger, wrapper] of [['subtitle-toggle','subtitle-control'], ['settings-toggle','settings-control']]) {
    el(trigger).onclick = () => { const open = el(wrapper).dataset.open !== 'true'; el(wrapper).dataset.open = String(open); el(trigger).setAttribute('aria-expanded', String(open)); };
    el(wrapper).addEventListener('mouseleave', () => el(wrapper).dataset.open = 'false');
  }
  el('speed-control').addEventListener('mouseleave', () => el('speed-control').dataset.open = 'false');
  el('subtitle-settings-open').onclick = () => { el('subtitle-main').hidden = true; el('subtitle-settings').hidden = false; el('subtitle-control').dataset.open = 'true'; };
  el('subtitle-settings-back').onclick = () => { el('subtitle-main').hidden = false; el('subtitle-settings').hidden = true; };
  el('more-settings-open').onclick = () => { el('playback-main').hidden = true; el('playback-more').hidden = false; el('settings-control').dataset.open = 'true'; };
  el('more-settings-back').onclick = () => { el('playback-main').hidden = false; el('playback-more').hidden = true; };
  const subtitleDefaults = { size:'medium', color:'white', outline:'none', position:'bottom', opacity:0.85, scale:true, fade:false };
  function applySubtitleSettings(settings) {
    for (const key of Object.keys(subtitleDefaults)) {
      const field = el('subtitle-' + key);
      if (typeof subtitleDefaults[key] === 'boolean') field.checked = settings[key]; else field.value = settings[key];
    }
    // Preferences remain editable without enabling the login-only subtitle track.
    player.dataset.subtitleSize = settings.size; player.dataset.subtitleColor = settings.color;
    player.dataset.subtitleOutline = settings.outline; player.dataset.subtitlePosition = settings.position;
    player.dataset.subtitleOpacity = settings.opacity; player.dataset.subtitleScale = settings.scale; player.dataset.subtitleFade = settings.fade;
    save('bili-subtitle-settings', settings);
  }
  applySubtitleSettings({ ...subtitleDefaults, ...read('bili-subtitle-settings', {}) });
  for (const key of Object.keys(subtitleDefaults)) el('subtitle-' + key).onchange = () => {
    const settings = {};
    for (const name of Object.keys(subtitleDefaults)) settings[name] = typeof subtitleDefaults[name] === 'boolean' ? el('subtitle-' + name).checked : el('subtitle-' + name).value;
    applySubtitleSettings(settings);
  };
  el('subtitle-reset').onclick = () => applySubtitleSettings(subtitleDefaults);
  const preferences = { autoStart:true, mirror:false, loop:false, fill:false, keyboard:true, muted:true, ...read('bili-playback-settings', {}) };
  function updatePreferences() { save('bili-playback-settings', preferences); }
  for (const [key, id] of [['autoStart','auto-start'],['mirror','mirror-toggle'],['loop','loop-toggle']]) {
    el(id).checked = preferences[key];
    el(id).onchange = e => {
      preferences[key] = e.target.checked; updatePreferences();
      player.loop = preferences.loop;
      player.setAttribute('style', 'transform:' + (preferences.mirror ? 'scaleX(-1)' : 'none') + ';object-fit:' + (preferences.fill ? 'cover' : 'contain'));
    };
  }
  player.loop = preferences.loop;
  player.muted = preferences.muted;
  player.setAttribute('style', 'transform:' + (preferences.mirror ? 'scaleX(-1)' : 'none') + ';object-fit:' + (preferences.fill ? 'cover' : 'contain'));
  const pip = async () => { if (!watchPreferences.nativePip()) { shell.classList.toggle('mini-player'); return; } try { if (!document.pictureInPictureEnabled) return notice('当前浏览器不支持画中画'); if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await player.requestPictureInPicture(); } catch { notice('请先播放视频再开启画中画'); } };
  el('pip-toggle').onclick = pip; el('pip-top').onclick = pip;
  const wide = () => el('video-page').classList.toggle('wide-mode'); el('wide-top').onclick = wide;
  const syncFullscreenLayout = () => {
    const fullscreen = document.fullscreenElement === shell || shell.classList.contains('web-full');
    shell.classList.toggle('fullscreen-layout', fullscreen);
    if (fullscreen) el('fullscreen-danmaku-slot').append(el('danmaku-compose'));
    else el('danmaku-compose-home').after(el('danmaku-compose'));
    el('fullscreen-toggle').setAttribute('data-tooltip', fullscreen ? '退出全屏 (f)' : '进入全屏 (f)');
  };
  document.addEventListener('fullscreenchange', syncFullscreenLayout);
  el('web-fullscreen').onclick = () => { shell.classList.toggle('web-full'); syncFullscreenLayout(); };
  el('fullscreen-episodes').onclick = () => { if (el('video-collection').hidden) return notice('当前视频未加入合集'); el('fullscreen-collection').hidden = !el('fullscreen-collection').hidden; };
  el('fullscreen-toggle').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.requestFullscreen(); } catch { notice('当前浏览器无法开启全屏'); } };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { shell.classList.remove('web-full'); syncFullscreenLayout(); for (const id of ['speed-control','subtitle-control','settings-control']) el(id).dataset.open = 'false'; } if (preferences.keyboard && e.key.toLowerCase() === 'f' && !el('login-dialog').open && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); el('fullscreen-toggle').onclick(); } if (preferences.keyboard && e.code === 'Space' && !el('login-dialog').open && !['INPUT','BUTTON','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); play(); } });
  el('danmaku-toggle').onclick = () => { enabled = !enabled; el('danmaku-toggle').setAttribute('aria-pressed', String(enabled)); el('danmaku-toggle').dataset.enabled = String(enabled); el('danmaku-overlay').hidden = !enabled; if (!enabled) hideDanmakuActions(); };
  const watchPreferences = setupWatchPreferences(player, { read, save, notice });
  const watchSidebar = setupWatchSidebar({ read, save, notice, getUsers:()=>blocked,
    setUsers: users => { blocked = users; save('bili-blocked-users', [...blocked]); },
    onChange: () => { hideDanmakuActions(); el('danmaku-overlay').replaceChildren(); renderDanmaku(); }
  });
  function renderDanmaku() {
    el('danmaku-list').replaceChildren(...danmaku.map(d => {
      const isBlocked = watchSidebar.isBlocked(d.userId), row = node('div', 'danmaku-row' + (isBlocked ? ' blocked' : ''));
      const date = node('span', 'danmaku-date', isBlocked ? '已屏蔽' : d.sentAt?.replace('T', ' ').slice(5, 16));
      const button = node('button', '', isBlocked ? '取消屏蔽' : '屏蔽用户');
      button.setAttribute('aria-label', isBlocked ? '取消屏蔽该弹幕的发送者' : '屏蔽该弹幕的发送者');
      button.addEventListener('mouseenter', () => showSenderTooltip(button, isBlocked)); button.addEventListener('focus', () => showSenderTooltip(button, isBlocked));
      button.addEventListener('mouseleave', () => el('sender-tooltip').hidden = true); button.addEventListener('blur', () => el('sender-tooltip').hidden = true);
      button.onclick = () => { el('sender-tooltip').hidden = true; hideDanmakuActions(); watchSidebar.setUserBlocked(d.userId, !isBlocked); el('danmaku-overlay').querySelectorAll('[data-user-id]').forEach(line => { if (blocked.has(line.dataset.userId)) line.remove(); }); renderDanmaku(); watchSidebar.refresh(); };
      row.append(node('span', '', clock(d.timestamp)), node('span', '', d.content), date, button); row.children[1].title = d.content;
      return row;
    }));
    if (!danmaku.length) el('danmaku-list').append(node('p', 'status', '暂无弹幕'));
  }
  try {
    const { video, description, tags } = await api('/videos/' + encodeURIComponent(id));
    startViewerPresence(id);
    document.title = video.title + ' - dilidili'; el('video-title').textContent = video.title;
    el('video-meta').textContent = '▷ ' + shortCount(video.plays) + '　 ▤ ' + shortCount(video.danmaku) + '　 ' + (video.publishedAt?.replace('T', ' ') || '');
    el('video-description').textContent = description || '-';
    el('video-tags').replaceChildren(link('/channel/' + video.categoryId, video.category), ...tags.map(t => link('/search?tag=' + encodeURIComponent(t), t)));
    el('fullscreen-title').textContent = video.title; el('watch-author-name').textContent = video.author; el('watch-author-link').href = '/space/' + video.authorId;
    el('watch-avatar').src = '/api/authors/' + video.authorId + '/avatar'; el('watch-avatar').onerror = e => { e.target.removeAttribute('src'); e.target.alt = 'UP'; };
    api('/authors/' + video.authorId).then(a => { el('watch-signature').textContent = a.signature || '这个人很神秘，什么都没有写'; el('watch-followers').textContent = shortCount(a.followers); }).catch(() => el('watch-signature').textContent = '');
    el('player-author-avatar').src = '/api/authors/' + video.authorId + '/avatar';
    el('player-author-avatar').onerror = e => { e.target.hidden = true; };
    player.poster = video.coverUrl;
    player.onerror = () => { el('player-status').hidden = false; el('player-status').textContent = '视频文件暂时不可用，请确认本地媒体文件与数据库路径一致'; };
    if (video.streamUrl) player.src = video.streamUrl;
    else { el('player-status').hidden = false; el('player-status').textContent = '暂无视频文件'; }
    if (watched >= 30) gate(false);
    else if (video.streamUrl && preferences.autoStart) { player.muted = preferences.muted; player.play().catch(() => {}); }
    api('/videos/' + id + '/engagement').then(stats => { for (const key of ['like','coin','favorite','share']) el(key + '-count').textContent = shortCount(stats[key]); }).catch(() => { document.querySelector('.video-actions').title = '互动数据暂时加载失败'; });
    api('/videos/' + id + '/danmaku').then(rows => { danmaku = rows; renderDanmaku(); }).catch(() => el('danmaku-list').append(node('p', 'status', '弹幕加载失败，请刷新重试')));
  } catch (error) { el('video-title').textContent = error.message === '404' ? '视频不存在或已下架' : '视频加载失败'; el('player-status').hidden = false; el('player-status').textContent = '请返回首页选择其他视频'; }
  let collectionNext = null, collectionPrevious = null;
  try {
    const collection = await api('/videos/' + id + '/collection');
    if (collection?.title && collection.items.length) {
      const index = collection.items.findIndex(v => String(v.id) === id);
      el('collection-title').textContent = collection.title;
      el('collection-position').textContent = '(' + (index + 1) + '/' + collection.items.length + ')';
      el('collection-plays').textContent = shortCount(collection.plays) + '播放';
      el('collection-list').replaceChildren(...collection.items.map(v => {
        const item = link('/video/' + encodeURIComponent(v.id), null, 'collection-item' + (String(v.id) === id ? ' current' : ''));
        item.setAttribute('aria-current', String(v.id) === id ? 'true' : 'false');
        item.append(node('span', '', v.title), node('time', '', clock(v.duration))); item.title = v.title;
        return item;
      }));
      el('fullscreen-collection-list').replaceChildren(...collection.items.map(v => {
        const item = link('/video/' + encodeURIComponent(v.id), v.title, 'fullscreen-episode' + (String(v.id) === id ? ' current' : ''));
        return item;
      }));
      el('video-collection').hidden = false;
      collectionNext = collection.items[index + 1] || null; collectionPrevious = collection.items[index - 1] || null;
    } else el('video-collection').hidden = true;
  } catch { el('video-collection').hidden = true; }
  setupWatchComments(id);
  setupWatchScroll(player, shell);
  try { const result = await api('/videos?size=40'); const related = result.items.filter(v => String(v.id) !== id).slice(0,8); nextVideo = related[0]; el('related-videos').replaceChildren(...related.map(card)); setupRelatedExpansion(result.items.filter(v => String(v.id) !== id)); } catch { el('related-videos').textContent = '暂无推荐视频'; }
  el('fullscreen-prev').onclick = () => { if (collectionPrevious) location.assign('/video/' + collectionPrevious.id); else notice('没有上一集'); };
  el('fullscreen-next').onclick = () => { if (collectionNext || nextVideo) location.assign('/video/' + (collectionNext || nextVideo).id); else notice('没有下一集'); };
  player.addEventListener('ended', () => { if (el('autoplay-next').checked && (collectionNext || nextVideo) && watched < 30) location.assign('/video/' + (collectionNext || nextVideo).id); });
}
