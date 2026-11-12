async function loadSpace() {
  const base = '/space/' + encodeURIComponent(authorId);
  const view = ['uploads', 'lists', 'collection'].includes(params.get('tab')) ? params.get('tab') : keyword ? 'uploads' : 'home';
  const content = el('space-content');
  const currentSort = ['popular', 'favorites'].includes(params.get('sort')) ? params.get('sort') : 'latest';
  const url = (changes) => {
    const query = new URLSearchParams(changes);
    return base + '?' + query;
  };
  const videos = async (options = {}) => api('/videos?' + new URLSearchParams({ authorId, size: 20, sort: 'latest', ...options }));
  const collectionUrl = (id) => url({ tab: 'collection', collection: id });
  const layoutToggle = (compact) => {
    const enabled = params.get('layout') === compact;
    const a = link(url({ ...Object.fromEntries(params), layout: enabled ? '' : compact }), null, 'space-layout-toggle');
    a.setAttribute('aria-label', compact === 'cards' ? enabled ? '按合集分组展开' : '显示合集封面卡片' : enabled ? '切换网格显示' : '切换列表显示');
    a.title = a.getAttribute('aria-label');
    a.append(icon(compact === 'cards' ? enabled ? 'rows' : 'grid' : enabled ? 'grid' : 'rows'));
    return a;
  };
  const playAll = (entry) => {
    if (!entry) return null;
    const a = link('/video/' + encodeURIComponent(entry.id), '播放全部', 'secondary');
    a.prepend(icon('play'));
    return a;
  };
  const pagination = (result) => {
    const nav = node('nav', 'pagination');
    nav.setAttribute('aria-label', '视频分页');
    if (page) nav.append(link(url({ ...Object.fromEntries(params), page: page - 1 }), '上一页', 'secondary'));
    if (page || result.hasMore) nav.append(node('span', '', '第 ' + (page + 1) + ' 页'));
    if (result.hasMore) nav.append(link(url({ ...Object.fromEntries(params), page: page + 1 }), '下一页', 'secondary'));
    content.append(nav);
  };
  const grid = (entries) => {
    const list = view === 'uploads' && params.get('layout') === 'list';
    const result = node('div', 'space-grid' + (list ? ' space-video-list' : ''));
    result.append(...entries.map((video) => {
      const result = card(video);
      const date = node('span', '', video.publishedAt?.slice(0, 10) || '');
      const byline = result.querySelector('.card-byline');
      byline.replaceChildren(date);
      if (list) {
        result.querySelector('.card-video').append(node('p', 'space-video-description', video.description || '-'));
        byline.prepend(...result.querySelectorAll('.card-stats > span'));
      }
      return result;
    }));
    return result;
  };
  const section = (title, entries) => {
    const result = node('section', 'space-section');
    const heading = node('div', 'space-heading');
    heading.append(node('h2', '', title));
    result.append(heading, entries.length ? grid(entries) : node('p', 'space-empty', '暂无公开视频'));
    return result;
  };
  const empty = (message) => {
    const result = node('div', 'space-empty-state');
    const picture = node('img');
    picture.src = '/assets/space-empty.svg';
    picture.alt = '';
    result.append(picture, node('p', '', message));
    return result;
  };
  const videoSection = (title, result, firstVideo) => {
    const block = section(title, result.items);
    const heading = block.firstChild;
    const filters = node('nav', 'space-sort');
    filters.setAttribute('aria-label', '作者视频排序');
    for (const [key, label] of [['latest', '最新发布'], ['popular', '最多播放'], ['favorites', '最多收藏']]) {
      const a = link(url({ ...Object.fromEntries(params), sort: key, page: 0 }), label, key === currentSort ? 'active' : '');
      if (key === currentSort) a.setAttribute('aria-current', 'true');
      filters.append(a);
    }
    heading.append(filters);
    const actions = node('div', 'space-video-actions');
    if (firstVideo) {
      actions.append(playAll(firstVideo));
    }
    if (view === 'home') actions.append(link(url({ tab: 'uploads', sort: currentSort }), '查看更多 ›', 'secondary'));
    if (view === 'uploads') actions.append(layoutToggle('list'));
    heading.append(actions);
    return block;
  };
  try {
    const [author, collections] = await Promise.all([api('/authors/' + authorId), api('/authors/' + authorId + '/collections')]);
    el('author-name').textContent = author.name;
    el('author-level').textContent = author.level;
    el('author-signature').textContent = author.signature || '这个人很神秘，什么都没有写';
    el('author-uid').replaceChildren(icon('uid'), author.id);
    el('author-following').textContent = shortCount(author.following);
    el('author-followers').textContent = shortCount(author.followers);
    el('author-birthday').hidden = !author.birthday;
    el('author-birthday').replaceChildren(icon('cake'), author.birthday || '');
    const avatar = node('img');
    avatar.alt = author.name + '的头像';
    avatar.onerror = () => el('author-avatar').replaceChildren(node('span', '', Array.from(author.name || 'UP')[0]));
    el('author-avatar').replaceChildren(avatar);
    avatar.src = '/api/authors/' + author.id + '/avatar';
    document.title = author.name + '的个人空间 - dilidili';
    el('author-profile').classList.toggle('space-lists', view === 'lists' || view === 'collection');
    document.querySelector('.charge-card').hidden = !author.videos;
    el('space-tabs').replaceChildren(...[['home', '主页', 'tv'], ['uploads', '投稿 ' + author.videos, 'play'], ['lists', '合集和系列 ' + collections.length, 'list']].map(([key, label, symbol]) => {
      const active = key === view || key === 'lists' && view === 'collection';
      const a = link(url(key === 'home' ? {} : { tab: key }), label, active ? 'active' : '');
      a.prepend(icon(symbol));
      if (active) a.setAttribute('aria-current', 'page');
      return a;
    }));
    el('space-search').action = base;
    el('space-search').elements.keyword.value = keyword;
    content.replaceChildren();
    if (view === 'home' && !author.videos) {
      content.append(empty('空间主人还没投过稿，这里什么也没有...'));
      return;
    }
    if (view === 'collection') {
      const collection = collections.find((entry) => entry.id === params.get('collection'));
      if (!collection) { content.append(empty('合集不存在或不属于这位作者')); return; }
      const collectionSort = params.get('sort') === 'reverse' ? 'reverse' : 'sequence';
      const result = await videos({ compilationId: collection.id, sort: collectionSort, page });
      const block = section('合集·' + collection.title, result.items);
      block.classList.add('space-collection-detail');
      block.firstChild.firstChild.prepend(link(url({ tab: 'lists' }), '‹ ', 'collection-back'));
      const tools = node('div', 'collection-tools');
      const first = page ? (await videos({ compilationId: collection.id, sort: collectionSort, page: 0, size: 1 })).items[0] : result.items[0];
      if (first) tools.append(playAll(first));
      const order = node('select');
      order.setAttribute('aria-label', '合集排序');
      for (const [value, label] of [['sequence', '默认排序'], ['reverse', '倒序排序']]) {
        const option = node('option', '', label); option.value = value; order.append(option);
      }
      order.value = collectionSort;
      order.onchange = () => { location.href = url({ tab: 'collection', collection: collection.id, sort: order.value }); };
      tools.append(order);
      block.firstChild.after(node('p', 'collection-summary', '合集 · ' + collection.videos + ' 个视频'), tools);
      content.append(block); pagination(result);
    } else if (view === 'uploads') {
      const query = { page, sort: currentSort, q: keyword };
      if (params.get('collection')) query.compilationId = params.get('collection');
      const result = await videos(query);
      const collection = collections.find((entry) => entry.id === params.get('collection'));
      const first = page ? (await videos({ ...query, page: 0, size: 1 })).items[0] : result.items[0];
      content.append(videoSection(keyword ? '搜索：' + keyword : collection ? collection.title + ' · ' + collection.videos : '全部视频 · ' + author.videos, result, first));
      pagination(result);
    } else {
      if (view === 'home') {
        const featured = await videos({ sort: 'popular', size: 1 });
        if (featured.items.length) {
          const block = section('代表作', featured.items);
          block.classList.add('space-featured'); content.append(block);
        }
        const result = await videos({ sort: currentSort, size: 10 });
        content.append(videoSection('视频 · ' + author.videos, result, result.items[0]));
      }
      const blocks = await Promise.all(collections.map(async (collection) => {
        const result = await videos({ compilationId: collection.id, size: 6, sort: 'sequence' });
        if (view === 'lists' && params.get('layout') === 'cards') {
          const a = link(collectionUrl(collection.id), null, 'collection-tile');
          const cover = node('div', 'card-cover'); const img = node('img'); img.alt = ''; img.loading = 'lazy';
          cover.append(img, node('span', 'collection-count', '合集 ' + collection.videos + ' 个视频'));
          if (result.items.length) attachCover(img, result.items[0].coverUrl, '合集');
          else { img.hidden = true; cover.dataset.fallback = '合集'; }
          a.append(cover, node('h3', '', collection.title)); return a;
        }
        const block = section('合集·' + collection.title + ' · ' + collection.videos, result.items);
        block.classList.add('space-collection');
        const actions = node('div', 'space-video-actions');
        if (result.items.length) actions.append(playAll(result.items[0]));
        actions.append(link(collectionUrl(collection.id), '查看更多 ›', 'secondary'));
        block.firstChild.append(actions);
        return block;
      }));
      if (view === 'lists' && params.get('layout') === 'cards') {
        const tiles = node('div', 'collection-tiles'); tiles.append(...blocks); content.append(tiles);
      } else content.append(...blocks);
      if (view === 'lists') {
        const heading = node('div', 'space-heading');
        heading.append(node('h2', '', '合集和系列'));
        heading.append(layoutToggle('cards'));
        content.prepend(heading);
        if (!blocks.length) content.append(empty('空间主人还没建过合集和系列，这里什么也没有...'));
      }
    }
  } catch (error) {
    content.replaceChildren(node('p', 'space-empty', error.message === '404' ? '作者不存在，请返回首页选择其他作者' : '空间加载失败，请稍后重试'));
  }
}
