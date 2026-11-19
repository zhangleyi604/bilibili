const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const path = location.pathname;
const home = path === '/' || path === '/index.html';
document.querySelector('base').target = home ? '_blank' : '_self';
const search = path === '/search';
const rank = path === '/popular/rank';
const popularPage = path === '/popular' || path === '/popular/must-watch' || rank;
const collectionsPage = path === '/collections';
const creatorsPage = path === '/creators';
const latestPage = path === '/latest';
const watching = path.startsWith('/video/');
const service = path.startsWith('/service/');
const category = path.startsWith('/channel/') ? path.split('/')[2] : null;
const authorId = path.startsWith('/space/') ? path.split('/')[2] : null;
const sort = latestPage ? 'latest'
  : ['popular', 'latest', 'recommend', 'danmaku', 'favorites'].includes(params.get('sort')) ? params.get('sort')
  : authorId ? 'latest' : 'recommend';
const page = Math.min(10000, Math.max(0, Number.parseInt(params.get('page'), 10) || 0));
const keyword = params.get('keyword') || '';
const tag = params.get('tag') || '';
const narrow = matchMedia('(max-width: 1399.9px)');
let items = [];
let slides = [];
let slideIndex = 0;
const feedPageSize = 20;
const categorySymbols = { '娱乐': '🪄', '音乐': '🎵', '游戏': '🎮', '知识': '📚', '美食': '🍜', '动画': '🎨', '旅行': '🧳', '科技': '💻', '生活': '☀', '运动': '🏀', '影视': '🎬', '人工智能': '🤖', '时尚美妆': '💄', 'Vlog': '📷', '动物': '🐾' };
const feedVideoIds = new Set();
let feedNextPage = 0;
let feedHasMore = true;
let feedLoading = false;
let feedObserver;
let homeRefreshOffset = 0;
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function node(tag, className, label) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (label != null) result.textContent = label;
  return result;
}

async function api(path) {
  const response = await fetch('/api' + path);
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

function shortCount(count) {
  return count < 10000 ? String(count) : (count / 10000).toFixed(1).replace(/\.0$/, '') + '万';
}

function duration(seconds) {
  const mins = Math.floor(seconds / 60);
  const parts = mins >= 60 ? [Math.floor(mins / 60), mins % 60, seconds % 60] : [mins, seconds % 60];
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
}

function attachCover(img, url, category) {
  img.onerror = () => {
    img.removeAttribute('src');
    img.hidden = true;
    img.parentElement.dataset.fallback = category;
  };
  img.hidden = false;
  delete img.parentElement.dataset.fallback;
  img.src = url;
}

function card(video) {
  const result = node('article', 'card');
  const a = link('/video/' + encodeURIComponent(video.id), null, 'card-video');
  const cover = node('div', 'card-cover');
  const img = node('img');
  img.alt = '';
  img.loading = 'lazy';
  const stats = node('div', 'card-stats');
  const plays = node('span', '', shortCount(video.plays));
  const danmaku = node('span', '', shortCount(video.danmaku));
  plays.prepend(icon('play'));
  danmaku.prepend(icon('list'));
  stats.append(plays, danmaku, node('time', '', duration(video.duration)));
  cover.append(img, stats);
  attachCover(img, video.coverUrl, video.category);
  const title = node('h2', 'card-title', video.title);
  const date = video.publishedAt ? ' · ' + video.publishedAt.slice(5, 10) : '';
  const byline = node('p', 'card-byline');
  const author = link('/space/' + encodeURIComponent(video.authorId), null, 'card-author');
  author.append(node('span', 'up', 'UP'), video.author);
  byline.append(author, date);
  a.append(cover, title);
  result.append(a, byline);
  return result;
}

function link(href, label, className) {
  const a = node('a', className, label);
  a.href = href;
  if (href === '/') a.target = '_self';
  return a;
}

function status(message) {
  el('status').textContent = message;
  el('status').hidden = !message;
}

function pageUrl(changes) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) next.set(key, value);
  return path + '?' + next;
}

async function loadPopular() {
  const mustWatch = path === '/popular/must-watch';
  const tabs = node('nav', 'popular-tabs');
  tabs.setAttribute('aria-label', '热门栏目');
  const pages = [['/popular', '综合热门', 'popular-flame'], ['/popular/must-watch', '入站必刷', 'popular-medal'], ['/popular/rank', '排行榜', 'popular-podium']];
  for (const [url, label, symbol] of pages) {
    const tab = link(url);
    const badge = node('span', 'popular-tab-icon');
    badge.append(icon(symbol));
    tab.append(badge, node('span', '', label));
    if (url === path) {
      tab.setAttribute('aria-current', 'page');
      document.title = label + ' - dilidili';
    }
    tabs.append(tab);
  }
  const grid = el('video-grid');
  grid.classList.add('popular-grid');
  grid.hidden = false;
  grid.before(tabs);
  const categoryId = params.get('categoryId') || '';
  if (rank) {
    const filters = node('nav', 'popular-filters');
    filters.setAttribute('aria-label', '排行榜分区');
    grid.before(filters);
    api('/categories').then((categories) => {
      for (const { id, name } of [{ id: '', name: '全部' }, ...categories]) {
        const item = link(id ? path + '?categoryId=' + encodeURIComponent(id) : path, name);
        if (id === categoryId) item.setAttribute('aria-current', 'page');
        filters.append(item);
      }
    }).catch(() => { filters.textContent = '分区暂时无法加载'; });
  }
  const info = node('div', 'popular-info');
  const description = node('p', 'popular-description', rank ? '按上一完整周期的有效播放排名，每周五 18:00 更新'
    : mustWatch ? '这里是值得一看的站内精选视频' : '发现各个分区近期升温的视频');
  info.append(description);
  const cutoff = node('span', 'popular-cutoff');
  if (rank) info.append(cutoff);
  if (!rank && !mustWatch) {
    const trigger = node('button', 'popular-rules-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.append(icon('popular-info'), '热门规则');
    const dialog = node('dialog', 'popular-rules-dialog');
    dialog.setAttribute('aria-labelledby', 'popular-rules-title');
    const panel = node('div', 'popular-rules-panel');
    const heading = node('h2', '', '热门规则');
    heading.id = 'popular-rules-title';
    const close = node('button', 'popular-rules-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭热门规则');
    close.autofocus = true;
    panel.append(heading, close,
      node('p', '', '北京时间每天 12:00 更新，统计近 7 天。有效播放 1 分、点赞 2 分、收藏和投币各 3 分、有效评论 1 分。同一用户对同一视频的同类互动只计一次，每过 3 天贡献减半。'),
      cutoff);
    dialog.append(panel);
    trigger.onclick = () => dialog.showModal();
    close.onclick = () => dialog.close();
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
    info.append(trigger, dialog);
  }
  grid.before(info);
  status('正在加载…');
  try {
    const endpoint = rank ? '/popular/week' + (categoryId ? '?categoryId=' + encodeURIComponent(categoryId) : '')
      : mustWatch ? '/popular/must-watch' : '/popular/heat';
    const result = await api(endpoint);
    if (result.cutoff) cutoff.textContent = '本期结算：' + result.cutoff.slice(0, 16).replace('T', ' ');
    startListScroll(grid, result.items, popularCard, rank && result.cutoff ? '本期暂无有效播放记录'
      : mustWatch ? '暂无入选视频' : '暂无上榜视频');
  } catch {
    status('热门加载失败，请刷新重试');
  }
}

function popularCard({ video, score, position, reason }) {
  const item = node('article', 'popular-card');
  const url = '/video/' + encodeURIComponent(video.id);
  const cover = link(url, null, 'card-cover popular-cover');
  cover.setAttribute('aria-label', video.title);
  const img = node('img');
  img.alt = '';
  img.loading = 'lazy';
  cover.append(img);
  attachCover(img, video.coverUrl, video.category);
  if (rank) cover.append(node('span', 'popular-rank popular-rank-' + position, position));
  const content = node('div', 'popular-card-content');
  const title = node('h2', 'popular-card-title');
  title.append(link(url, video.title));
  const meta = node('div', 'popular-card-meta');
  if (!rank && !reason && score != null) meta.append(node('span', 'popular-label', '热度 ' + Number(score).toFixed(1)));
  const author = link('/space/' + encodeURIComponent(video.authorId), null, 'popular-card-author');
  author.append(node('span', 'up', 'UP'), node('span', '', video.author));
  const stats = node('div', 'popular-card-stats');
  const plays = node('span', '', shortCount(rank ? score : video.plays));
  const danmaku = node('span', '', shortCount(video.danmaku));
  plays.title = rank ? '本期有效播放' : '播放量';
  danmaku.title = '弹幕数';
  plays.prepend(icon('play'));
  danmaku.prepend(icon('list'));
  stats.append(plays, danmaku);
  meta.append(author, stats);
  if (reason) {
    const label = node('span', 'popular-label popular-reason', reason);
    label.prepend(icon('popular-medal'));
    meta.append(label);
  }
  content.append(title, meta);
  item.append(cover, content);
  return item;
}

async function loadDiscovery() {
  const title = collectionsPage ? '视频合集' : '推荐UP主';
  el('feed-title').textContent = title;
  el('feed-note').textContent = collectionsPage ? '浏览各位 UP 主的系列作品' : '发现不同分区的创作者和他们的作品';
  document.title = title + ' - dilidili';
  el('video-grid').hidden = true;
  const grid = el('discovery-grid');
  grid.classList.toggle('creator-list', creatorsPage);
  grid.hidden = false;
  status('正在加载…');
  try {
    const entries = await api(collectionsPage ? '/collections' : '/creators/recommended');
    startListScroll(grid, entries, collectionsPage ? collectionCard : creatorCard,
      collectionsPage ? '暂无公开视频合集' : '暂无推荐 UP 主');
  } catch {
    status('加载失败，请重试');
    const retry = node('button', 'secondary home-more', '重试');
    retry.type = 'button';
    retry.onclick = () => { grid.replaceChildren(); loadDiscovery(); };
    grid.replaceChildren(retry);
  }
}

function collectionCard(entry) {
  const a = link('/space/' + encodeURIComponent(entry.authorId) + '?tab=collection&collection='
    + encodeURIComponent(entry.id), null, 'card-video');
  const cover = node('div', 'card-cover');
  const img = node('img');
  img.alt = '';
  img.loading = 'lazy';
  cover.append(img);
  attachCover(img, '/api/videos/' + encodeURIComponent(entry.coverVideoId) + '/cover', '视频合集');
  a.append(cover, node('h2', 'card-title', entry.title));
  const card = node('article', 'discovery-card');
  card.append(a, node('p', 'discovery-meta', entry.author + ' · ' + entry.videos + ' 个视频'));
  return card;
}

function creatorCard(entry) {
  const id = encodeURIComponent(entry.id);
  const videoId = encodeURIComponent(entry.sampleVideoId);
  const videoUrl = '/video/' + videoId;
  const card = node('article', 'creator-card');
  const cover = link(videoUrl, null, 'card-cover creator-cover');
  cover.setAttribute('aria-label', '播放代表作：' + entry.sampleVideoTitle);
  const image = node('img');
  image.alt = '';
  image.loading = 'lazy';
  cover.append(image);
  attachCover(image, '/api/videos/' + videoId + '/cover', entry.category);
  const author = link('/space/' + id, null, 'creator-heading');
  const avatar = node('img', 'creator-avatar');
  avatar.alt = '';
  avatar.loading = 'lazy';
  avatar.src = '/api/authors/' + id + '/avatar';
  const info = node('div');
  author.append(avatar, node('h2', 'creator-name', entry.name));
  const signature = node('p', 'creator-signature', entry.signature?.trim() || '暂无简介');
  signature.title = signature.textContent;
  const work = link(videoUrl, entry.sampleVideoTitle, 'creator-work');
  work.title = entry.sampleVideoTitle;
  const representative = node('p', 'creator-representative');
  representative.append(node('span', 'creator-work-label', '代表作'), work);
  info.append(author, signature, representative);
  card.append(cover, info);
  return card;
}

function featuredCardCount() {
  return home ? (narrow.matches ? 4 : 6) : category ? (narrow.matches ? 2 : 3) : 0;
}

function renderCards() {
  const count = featuredCardCount();
  el('top-cards').replaceChildren(...items.slice(0, count).map(card));
  el('video-grid').replaceChildren(...items.slice(count).map(card));
}

function renderSlide() {
  const slide = slides[slideIndex];
  attachCover(el('slide-image'), slide.coverUrl, slide.category);
  el('slide-title').textContent = slide.title;
  el('slide-action').href = slide.id ? '/video/' + slide.id : '/popular';
  el('slide-action').setAttribute('aria-label', slide.title);
  el('dots').replaceChildren(...slides.map((_, index) => {
    const button = node('button', index === slideIndex ? 'active' : '');
    button.setAttribute('aria-label', '第 ' + (index + 1) + ' 张');
    button.setAttribute('aria-current', String(index === slideIndex));
    button.onclick = () => { slideIndex = index; renderSlide(); el('dots').children[index].focus(); };
    return button;
  }));
}

function rotateHomeCards() {
  const count = featuredCardCount();
  if (items.length < 2 * count) return;
  const lastGroup = Math.floor(items.length / count) - 1;
  const start = (homeRefreshOffset++ % lastGroup + 1) * count;
  for (let i = 0; i < count; i++) {
    [items[i], items[start + i]] = [items[start + i], items[i]];
  }
  renderCards();
}

async function loadScrollingFeed() {
  if (feedLoading || !feedHasMore) return;
  feedLoading = true;
  const more = el('feed-more');
  feedObserver?.unobserve(more);
  more.disabled = true;
  status(items.length ? '正在加载更多视频…' : '正在加载视频…');
  try {
    const query = new URLSearchParams({ page: feedNextPage, size: feedPageSize, sort });
    if (category) query.set('categoryId', category);
    if (!home) {
      if (keyword) query.set('q', keyword);
      if (tag) query.set('tag', tag);
    }
    const result = await api('/videos?' + query);
    const start = items.length;
    for (const video of result.items) {
      if (feedVideoIds.has(video.id)) continue;
      feedVideoIds.add(video.id);
      items.push(video);
    }
    const count = featuredCardCount();
    el('top-cards').append(...items.slice(start, count).map(card));
    el('video-grid').append(...items.slice(Math.max(start, count)).map(card));
    if (!feedNextPage && (home || category)) {
      slides = items.slice(0, 4);
      el('featured').hidden = !slides.length;
      document.querySelector('.carousel').hidden = !slides.length;
      if (slides.length) renderSlide();
    }
    if (home) el('refresh').hidden = items.length < 2 * count;
    feedNextPage++;
    feedHasMore = result.hasMore;
    more.hidden = !feedHasMore;
    more.textContent = '加载更多';
    status(feedHasMore ? '' : items.length ? '已展示全部视频' : category ? '本分区暂无视频' : '暂无视频');
    if (feedHasMore) feedObserver?.observe(more);
  } catch {
    more.hidden = false;
    more.textContent = '重试';
    status('视频加载失败，请重试');
  } finally {
    feedLoading = false;
    more.disabled = false;
  }
}

function observeMore(load) {
  const more = el('feed-more');
  more.onclick = load;
  if ('IntersectionObserver' in window) {
    return new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    }, { rootMargin: '0px 0px 600px 0px' });
  }
}

function startListScroll(grid, entries, render, emptyMessage) {
  const more = el('feed-more');
  let offset = 0;
  const observer = observeMore(appendBatch);
  function appendBatch() {
    observer?.unobserve(more);
    const batch = entries.slice(offset, offset + feedPageSize);
    grid.append(...batch.map(render));
    offset += batch.length;
    more.hidden = offset >= entries.length;
    status(!entries.length ? emptyMessage : more.hidden ? '已展示全部内容' : '');
    if (!more.hidden) observer?.observe(more);
  }
  grid.replaceChildren();
  appendBatch();
}

async function init() {
  document.body.classList.toggle('popular-page', popularPage);
  const withBanner = home || category || popularPage || latestPage || collectionsPage || creatorsPage;
  document.body.classList.toggle('inner-page', !withBanner);
  document.body.classList.toggle('channel-page', Boolean(category));
  document.body.classList.toggle('search-page', search);
  document.body.classList.toggle('author-page', Boolean(authorId));
  document.querySelector('.channels').hidden = watching || service || Boolean(authorId);
  document.querySelector('.channel-links a[href="' + path + '"]')?.setAttribute('aria-current', 'page');
  el('author-profile').hidden = !authorId;
  document.querySelector('.feed').hidden = watching || service || Boolean(authorId);
  el('video-page').hidden = !watching;
  el('service-page').hidden = !service;
  el('featured').hidden = !home;
  el('refresh').hidden = true;
  el('feed-toolbar').hidden = home;
  el('keyword').value = keyword;
  if (service) {
    const name = decodeURIComponent(path.split('/')[2]);
    el('service-title').textContent = name;
    el('service-message').textContent = name + '功能尚未接入';
    document.title = name + ' - dilidili';
    return;
  }
  if (watching) return loadWatchPage();
  if (authorId) return loadSpace();
  if (search) return loadSearch();
  if (popularPage) {
    document.querySelector('.channels').hidden = true;
    el('feed-toolbar').hidden = true;
    return loadPopular();
  }
  if (collectionsPage || creatorsPage) return Promise.all([loadDiscovery(), loadCategories()]);
  const title = category ? '分区视频' : latestPage ? '最新发布' : '推荐视频';
  el('feed-title').textContent = title;
  if (!home) document.title = title + ' - dilidili';
  el('feed-note').textContent = '';
  if (category) {
    document.querySelector('.carousel').setAttribute('aria-label', '分区精选视频');
  }
  if (home || category) setupChannelNavigation();
  if (!home && !category && !latestPage) {
    const tabs = node('nav', 'sort-tabs');
    tabs.setAttribute('aria-label', '视频排序');
    for (const [key, label] of [['recommend', '综合排序'], ['popular', '最多播放'], ['latest', '最新发布']]) {
      const a = link(pageUrl({ sort: key, page: 0 }), label, key === sort ? 'active' : '');
      if (key === sort) a.setAttribute('aria-current', 'page');
      tabs.append(a);
    }
    el('feed-toolbar').after(tabs);
  }
  if (home) el('refresh').onclick = rotateHomeCards;
  feedObserver = observeMore(loadScrollingFeed);
  loadScrollingFeed();
  return loadCategories();
}

function setupChannelNavigation() {
  const bar = document.querySelector('.navbar');
  const banner = document.querySelector('.banner');
  const homeLink = bar.querySelector('.home-link');
  const start = node('div', 'channel-nav-start');
  const logo = link('/', null, 'channel-nav-logo');
  const image = node('img');
  image.src = '/assets/dilidili.svg?v=2';
  image.alt = 'dilidili 首页';
  logo.append(image);

  const trigger = node('div', 'channel-nav-trigger');
  const toggle = node('button', 'channel-nav-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', '选择分区');
  toggle.setAttribute('aria-controls', 'channel-nav-list');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(icon('right'));
  const panel = node('div', 'channel-nav-panel');
  panel.inert = true;
  const list = node('ul', 'channel-nav-list');
  list.id = 'channel-nav-list';
  list.append(node('li', 'channel-nav-message', '正在加载分区…'));
  panel.append(list);

  homeLink.before(start);
  trigger.append(homeLink, toggle);
  start.append(logo, trigger, panel);
  const setOpen = (open) => {
    if (open && !bar.classList.contains('channel-nav-stuck')) return;
    panel.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    start.classList.toggle('channel-nav-open', open);
  };
  trigger.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') setOpen(true);
  });
  start.addEventListener('pointerleave', () => {
    if (!panel.contains(document.activeElement)) setOpen(false);
  });
  start.addEventListener('focusout', (event) => {
    if (!start.contains(event.relatedTarget)) setOpen(false);
  });
  toggle.onclick = () => setOpen(panel.inert);
  start.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.inert) return;
    toggle.focus();
    setOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!start.contains(event.target)) setOpen(false);
  });

  const pin = (stuck) => {
    if (!stuck) setOpen(false);
    bar.classList.toggle('channel-nav-stuck', stuck);
  };
  pin(banner.getBoundingClientRect().bottom <= 0);
  const observer = new IntersectionObserver(([entry]) => pin(entry.boundingClientRect.bottom <= 0));
  observer.observe(banner);
}

function setupHomeChannelBar(categories) {
  const channels = document.querySelector('.channels');
  const nav = node('nav', 'home-channel-bar');
  nav.setAttribute('aria-label', '首页分区导航');
  nav.hidden = true;

  const row = node('div', 'layout home-channel-row');
  const shortcuts = node('div', 'home-channel-shortcuts');
  const popular = channels.querySelector('.channel-icons a').cloneNode(true);
  shortcuts.append(popular);

  const viewport = node('div', 'home-channel-viewport');
  viewport.id = 'home-channel-options';
  const options = node('div', 'home-channel-options');
  const links = categories.map(({ id, name }) => link('/channel/' + encodeURIComponent(id), name));
  links.push(...Array.from(channels.querySelectorAll('.channel-links a'), (a) => link(a.href, a.textContent)));
  options.append(...links);
  viewport.append(options);

  const toggle = node('button', 'home-channel-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', '展开全部分区');
  toggle.setAttribute('aria-controls', viewport.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(icon('right'));
  row.append(shortcuts, toggle, viewport);
  nav.append(row);
  document.querySelector('.navbar').after(nav);

  let expanded = false;
  const measure = () => {
    if (nav.hidden) return;
    const firstRow = links[0].offsetTop;
    viewport.style.setProperty('--home-channel-full-height', options.offsetHeight + 'px');
    for (const a of links) a.inert = !expanded && a.offsetTop !== firstRow;
    toggle.style.visibility = links.every((a) => a.offsetTop === firstRow) ? 'hidden' : '';
  };
  const setExpanded = (open) => {
    if (!open && expanded) options.scrollTop = 0;
    expanded = open;
    nav.classList.toggle('home-channel-expanded', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起全部分区' : '展开全部分区');
    measure();
  };
  toggle.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') setExpanded(true);
  });
  toggle.onclick = () => setExpanded(!expanded);
  nav.addEventListener('pointerleave', () => {
    if (!viewport.contains(document.activeElement)) setExpanded(false);
  });
  nav.addEventListener('focusout', (event) => {
    if (!nav.contains(event.relatedTarget)) setExpanded(false);
  });
  nav.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !expanded) return;
    toggle.focus();
    setExpanded(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (expanded && !nav.contains(event.target)) setExpanded(false);
  });

  const pin = (stuck) => {
    if (!stuck) setExpanded(false);
    nav.hidden = !stuck;
    measure();
  };
  pin(channels.getBoundingClientRect().bottom <= 64);
  const intersection = new IntersectionObserver(([entry]) => {
    pin(entry.boundingClientRect.bottom <= entry.rootBounds.top);
  }, { rootMargin: '-64px 0px 0px' });
  intersection.observe(channels);
  new ResizeObserver(measure).observe(options);
}

async function loadCategories() {
  const menu = el('channel-nav-list');
  try {
    const categories = await api('/categories');
    el('categories').replaceChildren(link('/', '首页'), ...categories.map((item) => {
      const a = link('/channel/' + item.id, item.name, item.id === category ? 'active' : '');
      if (item.id === category) {
        el('feed-title').textContent = item.name;
        if (category) {
          el('feed-title').prepend(node('span', 'category-symbol', categorySymbols[item.name] || '✦'));
        }
        document.title = item.name + ' - dilidili';
        a.setAttribute('aria-current', 'page');
      }
      return a;
    }));
    if (home && categories.length) setupHomeChannelBar(categories);
    if (menu && categories.length) {
      menu.replaceChildren(...categories.map(({ id, name }) => {
        const row = node('li');
        const item = link('/channel/' + encodeURIComponent(id));
        const symbol = node('span', 'channel-nav-icon', categorySymbols[name] || '✦');
        symbol.setAttribute('aria-hidden', 'true');
        item.append(symbol, name);
        if (id === category) item.setAttribute('aria-current', 'page');
        row.append(item);
        return row;
      }));
    } else if (menu) {
      menu.replaceChildren(node('li', 'channel-nav-message', '暂无可选分区'));
    }
  } catch {
    el('categories').textContent = '分区暂时不可用';
    if (menu) menu.replaceChildren(node('li', 'channel-nav-message', '分区暂时不可用'));
  }
}

el('prev-slide').onclick = () => { if (slides.length) { slideIndex = (slideIndex + slides.length - 1) % slides.length; renderSlide(); } };
el('next-slide').onclick = () => { if (slides.length) { slideIndex = (slideIndex + 1) % slides.length; renderSlide(); } };
document.querySelector('.back-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
if (home || category) {
  narrow.addEventListener('change', () => {
    renderCards();
    if (home) el('refresh').hidden = items.length < 2 * featuredCardCount();
  });
}
init();
