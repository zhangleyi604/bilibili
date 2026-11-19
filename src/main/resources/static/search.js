function loadSearch() {
  const videoSorts = [['recommend', '综合排序'], ['popular', '最多播放'], ['latest', '最新发布'], ['danmaku', '最多弹幕'], ['favorites', '最多收藏']];
  const userSorts = [['defaultOrder', '默认排序'], ['followersDesc', '粉丝数由高到低'], ['followersAsc', '粉丝数由低到高'], ['levelDesc', 'Lv等级由高到低'], ['levelAsc', 'Lv等级由低到高']];
  const feed = document.querySelector('.feed');
  const grid = el('video-grid');
  const pagination = el('pagination');
  const form = document.querySelector('.navbar .search');
  form.classList.add('search-main');
  form.querySelector('button').replaceChildren('搜索');
  form.prepend(icon('search'));

  const header = node('div', 'search-header');
  const tabs = node('nav', 'search-tabs');
  tabs.setAttribute('aria-label', '搜索类型');
  const indicator = node('span', 'search-tab-indicator');
  indicator.setAttribute('aria-hidden', 'true');
  indicator.hidden = true;
  const tabLinks = new Map([['all', '综合'], ['video', '视频'], ['user', '用户']].map(([key, label]) => {
    const a = link(path, label);
    a.dataset.searchLink = '';
    tabs.append(a);
    return [key, a];
  }));
  tabs.append(indicator);
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

  const users = node('section', 'search-users');
  users.setAttribute('aria-label', '相关用户');
  const toolbar = node('div', 'search-toolbar');
  const filters = node('div', 'search-filters');
  const sorts = node('nav', 'search-sorts');
  const more = node('button', 'secondary', '更多筛选');
  more.type = 'button';
  more.append(icon('right'));
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'search-filters');
  filters.id = 'search-filters';
  let filtersOpen = Boolean(params.get('categoryId'));
  more.onclick = () => {
    filtersOpen = !filtersOpen;
    setFiltersVisible(filtersOpen);
  };
  toolbar.append(sorts, more);
  feed.prepend(toolbar, filters, users);

  let currentType;
  let latestRequest = 0;
  let summaryRequest;
  const filterLinks = new Map();
  let categoriesAvailable = true;
  const url = (query, changes) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    return path + '?' + next;
  };
  const resultLink = (query, changes, label, className) => {
    const a = link(url(query, changes), label, className);
    a.dataset.searchLink = '';
    return a;
  };
  const select = (a, active) => {
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  };
  const setFiltersVisible = (visible) => {
    filters.hidden = !visible;
    more.setAttribute('aria-expanded', String(visible));
  };
  const updateFilters = (query) => {
    const categoryId = query.get('categoryId') || '';
    for (const [id, a] of filterLinks) {
      a.href = url(query, { categoryId: id, page: 0 });
      select(a, categoryId === id);
    }
  };
  const highlight = (element) => {
    if (!keyword) return;
    const value = element.textContent;
    const index = value.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
    if (index < 0) return;
    element.replaceChildren(value.slice(0, index), node('mark', '', value.slice(index, index + keyword.length)), value.slice(index + keyword.length));
  };
  const userCard = (user, type) => {
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
    return row;
  };
  const pageSize = 20;
  const paginate = (query, page, total) => {
    const pages = Math.min(10001, Math.ceil(total / pageSize));
    if (pages <= 1) return;
    const current = Math.min(pages, page + 1);
    const step = (label, number) => {
      if (number >= 1 && number <= pages) return resultLink(query, { page: number - 1 }, label, 'search-page-step');
      const disabled = node('span', 'search-page-step', label);
      disabled.setAttribute('aria-disabled', 'true');
      return disabled;
    };
    pagination.append(step('上一页', current - 1));
    for (const number of searchPageNumbers(current, pages)) {
      if (number === null) {
        const gap = node('span', 'search-page-gap', '…');
        gap.setAttribute('aria-hidden', 'true');
        pagination.append(gap);
        continue;
      }
      const item = resultLink(query, { page: number - 1 }, number, 'search-page-number');
      if (number === current) item.setAttribute('aria-current', 'page');
      pagination.append(item);
    }
    pagination.append(step('下一页', current + 1));
  };
  const updateCounts = (summary) => {
    for (const [key, count] of [['video', summary.totalVideos], ['user', summary.totalUsers]]) {
      const a = tabLinks.get(key);
      if (count != null && !a.querySelector('.search-count')) {
        a.append(node('span', 'search-count', count > 99 ? '99+' : count));
      }
    }
    alignIndicator();
  };
  const alignIndicator = () => {
    const active = tabLinks.get(currentType);
    indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    indicator.hidden = false;
  };
  const summary = () => {
    summaryRequest ??= api('/search?' + new URLSearchParams({ q: keyword, tag, userSort: 'defaultOrder', page: 0, size: 3 }))
      .then((result) => {
        updateCounts(result);
        return result;
      })
      .catch(() => {
        summaryRequest = null;
        return null;
      });
    return summaryRequest;
  };

  async function render(query) {
    const request = ++latestRequest;
    const type = tabLinks.has(query.get('type')) ? query.get('type') : 'all';
    const showUsers = type === 'user';
    const sortKey = showUsers ? 'userSort' : 'sort';
    const options = showUsers ? userSorts : videoSorts;
    const order = options.some(([key]) => key === query.get(sortKey)) ? query.get(sortKey) : options[0][0];
    const page = Math.min(10000, Math.max(0, Number.parseInt(query.get('page'), 10) || 0));
    const categoryId = query.get('categoryId') || '';
    for (const [key, a] of tabLinks) {
      a.href = url(query, { type: key, page: 0 });
      select(a, key === type);
    }
    currentType = type;
    alignIndicator();

    sorts.setAttribute('aria-label', showUsers ? '用户排序' : '视频排序');
    if (sorts.dataset.sortKey !== sortKey) {
      sorts.replaceChildren(...options.map(([, label]) => link(path, label)));
      sorts.dataset.sortKey = sortKey;
    }
    options.forEach(([key], index) => {
      const a = sorts.children[index];
      a.href = url(query, { [sortKey]: key, page: 0 });
      a.dataset.searchLink = '';
      select(a, key === order);
    });
    more.hidden = showUsers || !categoriesAvailable;
    setFiltersVisible(!more.hidden && filtersOpen);
    updateFilters(query);

    users.classList.toggle('search-users-grid', showUsers);
    users.hidden = true;
    users.replaceChildren();
    pagination.replaceChildren();
    grid.hidden = showUsers;
    grid.setAttribute('aria-busy', String(!showUsers));
    grid.replaceChildren(...(showUsers ? [] : Array.from({ length: 15 }, () => {
      const placeholder = node('div', 'search-placeholder');
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.append(node('div', 'search-placeholder-cover'), node('div', 'search-placeholder-title'), node('div', 'search-placeholder-byline'));
      return placeholder;
    })));
    status('正在加载…');
    const summaryData = summary();
    try {
      if (showUsers) {
        const result = await api('/search?' + new URLSearchParams({ q: keyword, tag, userSort: order, page, size: pageSize }));
        if (request !== latestRequest) return;
        updateCounts(result);
        users.replaceChildren(...result.users.map((user) => userCard(user, type)));
        users.hidden = !result.users.length;
        status(result.users.length ? '' : '没有找到相关用户，试试其他关键词');
        paginate(query, page, result.totalUsers);
        return;
      }

      const videoQuery = new URLSearchParams({ q: keyword, tag, sort: order, page, size: pageSize, includeTotal: true });
      if (categoryId) videoQuery.set('categoryId', categoryId);
      const [videos, related] = await Promise.all([
        api('/videos?' + videoQuery),
        type === 'all' && !page ? summaryData : null
      ]);
      if (request !== latestRequest) return;
      if (related) {
        users.replaceChildren(...related.users.map((user) => userCard(user, type)));
        if (related.totalUsers > related.users.length) {
          users.append(resultLink(query, { type: 'user', page: 0 }, '查看更多用户 ›', 'search-more-users'));
        }
        users.hidden = !users.childElementCount;
      }
      grid.replaceChildren(...videos.items.map((video) => {
        const result = card(video);
        highlight(result.querySelector('.card-title'));
        return result;
      }));
      status(videos.items.length || users.childElementCount ? '' : '没有找到相关结果，试试其他关键词');
      paginate(query, page, videos.totalVideos);
    } catch {
      if (request !== latestRequest) return;
      grid.replaceChildren();
      status('搜索加载失败，请稍后重试');
    } finally {
      if (request === latestRequest) grid.removeAttribute('aria-busy');
    }
  }

  const navigate = (event) => {
    const a = event.target.closest('a[data-search-link]');
    if (!a || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (a.href === location.href && el('status').hidden) return;
    if (a.href !== location.href) history.pushState(null, '', a.href);
    if (header.getBoundingClientRect().bottom < 0) header.scrollIntoView();
    render(new URLSearchParams(location.search));
  };
  tabs.addEventListener('click', navigate);
  feed.addEventListener('click', navigate);
  window.addEventListener('resize', alignIndicator);
  window.addEventListener('popstate', () => render(new URLSearchParams(location.search)));
  const initial = render(params);
  api('/categories').then((categories) => {
    const query = new URLSearchParams(location.search);
    filters.append(node('span', '', '分区'));
    for (const { id, name } of [{ id: '', name: '全部分区' }, ...categories]) {
      const a = resultLink(query, { categoryId: id, page: 0 }, name);
      filterLinks.set(String(id), a);
      filters.append(a);
    }
    updateFilters(query);
  }).catch(() => {
    categoriesAvailable = false;
    more.hidden = true;
    setFiltersVisible(false);
  });
  return initial;
}

function searchPageNumbers(current, total) {
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
  if (total <= 9) return range(1, total);
  if (current <= 5) return [...range(1, 7), null, total];
  if (current >= total - 4) return [1, null, ...range(total - 6, total)];
  return [1, null, ...range(current - 2, current + 2), null, total];
}
