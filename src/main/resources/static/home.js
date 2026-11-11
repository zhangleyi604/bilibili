const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const path = location.pathname;
const home = path === '/' || path === '/index.html';
document.querySelector('base').target = home ? '_blank' : '_self';
const search = path === '/search';
const rank = path === '/popular/rank';
const watching = path.startsWith('/video/');
const service = path.startsWith('/service/');
const category = path.startsWith('/channel/') ? path.split('/')[2] : null;
const sort = ['popular', 'latest', 'recommend'].includes(params.get('sort')) ? params.get('sort')
  : path === '/popular' ? 'popular' : path === '/latest' ? 'latest' : 'recommend';
const page = Math.min(10000, Math.max(0, Number.parseInt(params.get('page'), 10) || 0));
const keyword = params.get('keyword') || '';
const tag = params.get('tag') || '';
const narrow = matchMedia('(max-width: 1000px)');
let items = [];
let slides = [];
let slideIndex = 0;
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

function videoLink(id, className) {
  return link('/video/' + encodeURIComponent(id), null, className);
}

function card(video) {
  const link = videoLink(video.id, 'card');
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
  byline.append(node('span', 'up', 'UP'), video.author + date);
  link.append(cover, title, byline);
  return link;
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

function renderCards() {
  const count = home ? (narrow.matches ? 4 : 6) : 0;
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

async function loadFeed(requestedPage = page) {
  status('正在加载…');
  el('pagination').replaceChildren();
  const query = new URLSearchParams({ page: requestedPage, size: 20, sort });
  if (category) query.set('categoryId', category);
  if (keyword) query.set('q', keyword);
  if (tag) query.set('tag', tag);
  try {
    if (rank) {
      const results = await api('/ranks/weekly?' + query);
      el('rank-list').replaceChildren(...results.map((entry) => {
        const li = node('li');
        const a = videoLink(entry.id);
        a.append(node('strong', '', entry.rank), node('span', '', entry.title),
          node('small', '', shortCount(entry.plays) + ' 次有效播放'));
        li.append(a);
        return li;
      }));
      status(results.length ? '' : '本周暂无有效播放记录');
      return;
    }
    const result = await api('/videos?' + query);
    items = result.items;
    renderCards();
    status(items.length ? '' : search ? '没有找到相关视频，试试其他关键词' : '暂无视频');
    if (home) {
      slides = [{ title: '每一次相遇，都有新的精彩', coverUrl: '/assets/carousel.webp', category: '热门' }, ...items.slice(0, 4)];
      slideIndex = 0;
      renderSlide();
      el('refresh').onclick = () => loadFeed(result.hasMore ? requestedPage + 1 : 0);
    } else if (page || result.hasMore) {
      if (page) el('pagination').append(link(pageUrl({ page: page - 1 }), '上一页', 'secondary'));
      el('pagination').append(node('span', '', '第 ' + (page + 1) + ' 页'));
      if (result.hasMore) el('pagination').append(link(pageUrl({ page: page + 1 }), '下一页', 'secondary'));
    }
  } catch {
    status('视频加载失败，请稍后重试');
  }
}

async function loadVideo() {
  const player = el('player');
  const id = encodeURIComponent(path.split('/')[2]);
  function error(message) {
    el('player-status').textContent = message;
    el('player-status').hidden = false;
  }
  try {
    const { video, description, compilation, tags } = await api('/videos/' + id);
    document.title = video.title + ' - 哔哩哔哩';
    el('video-title').textContent = video.title;
    el('video-meta').textContent = [video.author, shortCount(video.plays) + ' 播放',
      shortCount(video.danmaku) + ' 弹幕', video.publishedAt?.replace('T', ' '), compilation].filter(Boolean).join(' · ');
    el('video-description').textContent = description || '';
    el('video-tags').replaceChildren(link('/channel/' + video.categoryId, video.category),
      ...tags.map((tag) => link('/search?tag=' + encodeURIComponent(tag), tag)));
    player.poster = video.coverUrl;
    player.onerror = () => error('视频文件暂时不可用');
    if (video.streamUrl) player.src = video.streamUrl;
    else error('暂无视频文件');
  } catch (e) {
    el('video-title').textContent = e.message === '404' ? '视频不存在或已下架' : '视频加载失败';
    player.hidden = true;
    error('请返回首页选择其他视频');
  }
  try {
    const result = await api('/videos?size=10');
    el('related-videos').replaceChildren(...result.items.filter((v) => v.id !== id).slice(0, 8).map(card));
  } catch {
    el('related-videos').textContent = '暂无推荐视频';
  }
}

async function init() {
  document.body.classList.toggle('inner-page', !home);
  document.body.classList.toggle('search-page', search);
  document.querySelector('.channels').hidden = watching || service;
  document.querySelector('.feed').hidden = watching || service;
  el('video-page').hidden = !watching;
  el('service-page').hidden = !service;
  el('featured').hidden = !home;
  el('feed-toolbar').hidden = home;
  el('rank-list').hidden = !rank;
  el('video-grid').hidden = rank;
  el('keyword').value = keyword;
  if (service) {
    const name = decodeURIComponent(path.split('/')[2]);
    el('service-title').textContent = name;
    el('service-message').textContent = name + '功能尚未接入';
    document.title = name + ' - 哔哩哔哩';
    return;
  }
  if (watching) return loadVideo();
  const title = search ? (keyword ? '“' + keyword + '” 的搜索结果' : tag ? '标签：' + tag : '搜索视频')
    : rank ? '每周播放排行榜' : category ? '分区视频' : path === '/latest' ? '最新发布' : path === '/recommend' ? '推荐视频' : '热门视频';
  el('feed-title').textContent = title;
  if (!home) document.title = title + ' - 哔哩哔哩';
  el('feed-note').textContent = rank ? '按本周有效播放次数排序' : '';
  if (!home && !rank) {
    const tabs = node('nav', 'sort-tabs');
    tabs.setAttribute('aria-label', '视频排序');
    for (const [key, label] of [['recommend', '综合排序'], ['popular', '最多播放'], ['latest', '最新发布']]) {
      const a = link(pageUrl({ sort: key, page: 0 }), label, key === sort ? 'active' : '');
      if (key === sort) a.setAttribute('aria-current', 'page');
      tabs.append(a);
    }
    el('feed-toolbar').after(tabs);
  }
  loadFeed();
  try {
    const categories = await api('/categories');
    el('categories').replaceChildren(link('/', '首页'), ...categories.map((item) => {
      const a = link('/channel/' + item.id, item.name, item.id === category ? 'active' : '');
      if (item.id === category) {
        el('feed-title').textContent = item.name;
        document.title = item.name + ' - 哔哩哔哩';
        a.setAttribute('aria-current', 'page');
      }
      return a;
    }));
  } catch {
    el('categories').textContent = '分区暂时不可用';
  }
}

el('prev-slide').onclick = () => { if (slides.length) { slideIndex = (slideIndex + slides.length - 1) % slides.length; renderSlide(); } };
el('next-slide').onclick = () => { if (slides.length) { slideIndex = (slideIndex + 1) % slides.length; renderSlide(); } };
document.querySelector('.back-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
if (home) narrow.addEventListener('change', renderCards);
init();
