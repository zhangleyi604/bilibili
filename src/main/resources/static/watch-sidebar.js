function setupWatchSidebar({read, save, notice, getUsers, setUsers, onChange}) {
  const settings = { enabled:true, disabledUsers:[], ...read('bili-shield-settings', {}) };
  let rules = read('bili-shield-rules', null) || (read('bili-danmaku-settings', {}).keywords || []).map(text => ({kind:'text',text,enabled:true}));
  let tab = 'text', view = 'list';
  function persist() { save('bili-shield-settings', settings); save('bili-shield-rules', rules); onChange(); }
  function isBlocked(userId) { return settings.enabled && getUsers().has(userId) && !settings.disabledUsers.includes(userId); }
  function allowed(d) {
    if (!settings.enabled) return true;
    if (isBlocked(d.userId)) return false;
    return !rules.some(rule => {
      if (!rule.enabled) return false;
      if (rule.kind === 'text') return d.content.includes(rule.text);
      try { return new RegExp(rule.text.slice(1,-1), 'u').test(d.content); } catch { return false; }
    });
  }
  function render() {
    el('shield-enabled').checked = settings.enabled; el('shield-body').hidden = !settings.enabled;
    for (const value of ['text','regex','user']) { el('shield-tab-' + value).setAttribute('aria-selected',String(tab===value)); }
    const entries = tab === 'user' ? [...getUsers()].map(text => ({text, enabled:!settings.disabledUsers.includes(text)})) : rules.filter(r => r.kind === tab);
    el('shield-count').textContent = '内容（' + (entries.length || '-') + '）';
    el('shield-rows').replaceChildren(...entries.map(entry => {
      const row = node('div','shield-row');
      const state = node('button','shield-state',entry.enabled ? '启用' : '停用');
      state.setAttribute('aria-label',(entry.enabled?'停用':'启用')+'屏蔽规则 '+entry.text);
      state.onclick = () => {
        if (tab === 'user') { settings.disabledUsers = settings.disabledUsers.filter(id => id !== entry.text); if (entry.enabled) settings.disabledUsers.push(entry.text); }
        else entry.enabled = !entry.enabled;
        persist(); render();
      };
      const remove = node('button','shield-delete','删除'); remove.setAttribute('aria-label','删除屏蔽规则 '+entry.text);
      remove.onclick = () => { if (tab === 'user') { const users = new Set(getUsers()); users.delete(entry.text); setUsers(users); settings.disabledUsers = settings.disabledUsers.filter(id=>id!==entry.text); } else rules = rules.filter(rule=>rule!==entry); persist(); render(); };
      row.append(node('span','',entry.text),state,remove);return row;
    }));
  }
  function show(next) {
    view = next;
    el('danmaku-sidebar-title').textContent = {list:'弹幕列表',block:'屏蔽设定',advanced:'高级弹幕'}[view];
    for (const value of ['list','block','advanced']) el('sidebar-' + value + '-view').hidden = value !== view;
    el('danmaku-panel').open = true; el('danmaku-sidebar-menu-items').hidden = true; el('danmaku-sidebar-menu').setAttribute('aria-expanded','false');
    if (next === 'block') render();
  }
  el('danmaku-sidebar-menu').onclick = e => { e.preventDefault(); e.stopPropagation(); el('danmaku-sidebar-menu-items').hidden = !el('danmaku-sidebar-menu-items').hidden; el('danmaku-sidebar-menu').setAttribute('aria-expanded',String(!el('danmaku-sidebar-menu-items').hidden)); };
  for (const value of ['list','block','advanced']) el('sidebar-view-' + value).onclick = e => { e.preventDefault(); e.stopPropagation(); show(value); };
  for (const value of ['text','regex','user']) el('shield-tab-' + value).onclick = () => { tab = value; render(); };
  el('shield-enabled').onchange = e => { settings.enabled = e.target.checked; persist(); render(); };
  el('shield-add').onclick = () => {
    const text = el('shield-input').value.trim(); if (!text) return;
    if (tab === 'user') { const users = new Set(getUsers()); users.add(text); setUsers(users); }
    else { const kind = text.startsWith('/') && text.endsWith('/') ? 'regex' : tab === 'regex' ? 'regex' : 'text';
      if (kind === 'regex') { try { if (!text.startsWith('/') || !text.endsWith('/')) throw new Error(); new RegExp(text.slice(1,-1),'u'); } catch { return notice('请输入有效正则，例如 /关键词/'); } }
      if (!rules.some(r=>r.kind===kind&&r.text===text)) rules.push({kind,text,enabled:true}); tab = kind;
    }
    el('shield-input').value = ''; persist(); render();
  };
  el('shield-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el('shield-add').onclick(); } });
  el('dm-keywords-open').onclick = () => { show('block'); el('danmaku-control').dataset.open = 'false'; };
  document.addEventListener('click', e => { if (!el('danmaku-sidebar-menu-items').contains(e.target) && e.target !== el('danmaku-sidebar-menu')) { el('danmaku-sidebar-menu-items').hidden = true; el('danmaku-sidebar-menu').setAttribute('aria-expanded','false'); } });
  render();
  function setUserBlocked(id, block) {
    const users = new Set(getUsers()); if (block) { users.add(id); settings.enabled = true; } else users.delete(id);
    settings.disabledUsers = settings.disabledUsers.filter(value=>value!==id); setUsers(users); persist(); render();
  }
  return { allowed, isBlocked, refresh:render, show, setUserBlocked };
}
