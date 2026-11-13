async function loadSearch() {
  const type = ['video', 'user'].includes(params.get('type')) ? params.get('type') : 'all';
  const userSorts = [['defaultOrder', '默认排序'], ['followersDesc', '粉丝数由高到低'], ['followersAsc', '粉丝数由低到高'], ['levelDesc', 'Lv等级由高到低'], ['levelAsc', 'Lv等级由低到高']];
  const userSort = userSorts.some(([key]) => key === params.get('userSort')) ? params.get('userSort') : 'defaultOrder';
  const feed = document.querySelector('.feed');
  const form = document.querySelector('.navbar .search');
  form.classList.add('search-main');
  form.querySelector('button').replaceChildren('搜索');
  form.prepend(icon('search'));
  const header = node('div', 'search-header');
  const tabs = node('nav', 'search-tabs');
  tabs.setAttribute('aria-label', '搜索类型');
  header.append(form, tabs);
  feed.before(header);
  el('feed-toolbar').hidden = true;
  const logo = link('/', null, 'search-brand');
  const brand = node('img');
  brand.src = '/assets/dilidili.svg?v=2';
  brand.alt = 'dilidili';
  logo.append(brand);
  document.querySelector('.home-link').before(logo);
  document.title = (keyword || tag || '搜索') + ' - dilidili';
  const users = node('section', 'search-users' + (type === 'user' ? ' search-users-grid' : ''));
  users.setAttribute('aria-label', '相关用户');
  const toolbar = node('div', 'search-toolbar');
  const filters = node('div', 'search-filters');
  const sorts = node('nav', 'search-sorts');
  sorts.setAttribute('aria-label', type === 'user' ? '用户排序' : '视频排序');
  const sortOptions = type === 'user' ? userSorts : [['recommend', '综合排序'], ['popular', '最多播放'], ['latest', '最新发布'], ['danmaku', '最多弹幕'], ['favorites', '最多收藏']];
  for (const [key, label] of sortOptions) {
    const active = key === (type === 'user' ? userSort : sort);
    const a = link(pageUrl({ [type === 'user' ? 'userSort' : 'sort']: key, page: 0 }), label, active ? 'active' : '');
    if (active) a.setAttribute('aria-current', 'page');
    sorts.append(a);
  }
  const more = node('button', 'secondary', '更多筛选');
  more.append(icon('right'));
  more.hidden = type === 'user';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'search-filters');
  filters.id = 'search-filters';
  filters.hidden = true;
  more.onclick = () => {
    filters.hidden = !filters.hidden;
    more.setAttribute('aria-expanded', String(!filters.hidden));
  };
  toolbar.append(sorts, more);
  if (type === 'user') feed.prepend(toolbar, users);
  else feed.prepend(users, toolbar, filters);
  el('video-grid').hidden = type === 'user';
  const highlight = (element) => {
    if (!keyword) return;
    const text = element.textContent;
    const index = text.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
    if (index < 0) return;
    element.replaceChildren(text.slice(0, index), node('mark', '', text.slice(index, index + keyword.length)), text.slice(index + keyword.length));
  };
  const paginate = (hasMore) => {
    if (page) el('pagination').append(link(pageUrl({ page: page - 1 }), '上一页', 'secondary'));
    if (page || hasMore) el('pagination').append(node('span', '', '第 ' + (page + 1) + ' 页'));
    if (hasMore) el('pagination').append(link(pageUrl({ page: page + 1 }), '下一页', 'secondary'));
  };
  status('正在加载…');
  try {
    const query = new URLSearchParams({ q: keyword, tag, userSort: type === 'user' ? userSort : 'defaultOrder', page: type === 'user' ? page : 0, size: type === 'user' ? 20 : 3 });
    const requests = [api('/search?' + query)];
    if (type !== 'user') {
      const videoQuery = new URLSearchParams({ q: keyword, tag, sort, page, size: 20 });
      if (params.get('categoryId')) videoQuery.set('categoryId', params.get('categoryId'));
      requests.push(api('/videos?' + videoQuery));
    }
    const [summary, videos] = await Promise.all(requests);
    for (const [key, label, count] of [['all', '综合'], ['video', '视频', summary.totalVideos], ['user', '用户', summary.totalUsers]]) {
      const a = link(pageUrl({ type: key, page: 0 }), label, key === type ? 'active' : '');
      if (count != null) a.append(node('span', 'search-count', count > 99 ? '99+' : count));
      if (key === type) a.setAttribute('aria-current', 'page');
      tabs.append(a);
    }
    if (type !== 'video' && (type === 'user' || !page)) {
      for (const user of summary.users) {
        const row = node('article', 'search-user');
        const avatar = link('/space/' + encodeURIComponent(user.id), null, 'search-avatar');
        const img = node('img');
        img.alt = user.name;
        img.src = '/api/authors/' + encodeURIComponent(user.id) + '/avatar';
        img.onerror = () => avatar.replaceChildren(node('span', '', Array.from(user.name || 'UP')[0]));
        avatar.append(img);
        const detail = node('div', 'search-user-info');
        const name = link(avatar.href, user.name, 'search-user-name');
        highlight(name);
        detail.append(name, node('p', 'search-user-stats', '粉丝：' + shortCount(user.followers) + '　视频：' + shortCount(user.videos)), node('p', 'search-signature', user.signature || ''));
        if (user.level) name.after(node('span', 'search-level', user.level));
        const follow = node('button', 'search-follow', '＋ 关注');
        follow.onclick = () => openLogin();
        if (type === 'user') detail.append(follow);
        row.append(avatar, detail);
        if (type !== 'user') row.append(follow);
        users.append(row);
      }
      if (type === 'all' && summary.totalUsers > summary.users.length) users.append(link(pageUrl({ type: 'user', page: 0 }), '查看更多用户 ›', 'search-more-users'));
    }
    users.hidden = !users.childElementCount;
    if (videos) {
      el('video-grid').replaceChildren(...videos.items.map((video) => {
        const result = card(video);
        highlight(result.querySelector('.card-title'));
        return result;
      }));
      status(videos.items.length || users.childElementCount ? '' : '没有找到相关结果，试试其他关键词');
      paginate(videos.hasMore);
    } else {
      status(summary.users.length ? '' : '没有找到相关用户，试试其他关键词');
      paginate(summary.hasMore);
    }
  } catch {
    status('搜索加载失败，请稍后重试');
  }
  if (type === 'user') return;
  try {
    const categories = await api('/categories');
    filters.append(node('span', '', '分区'), ...[{ id: '', name: '全部分区' }, ...categories].map((category) =>
      link(pageUrl({ categoryId: category.id, page: 0 }), category.name, (params.get('categoryId') || '') === category.id ? 'active' : '')));
    if (params.get('categoryId')) {
      filters.hidden = false;
      more.setAttribute('aria-expanded', 'true');
    }
  } catch {
    more.hidden = true;
  }
}
