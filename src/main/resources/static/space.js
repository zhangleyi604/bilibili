async function loadSpace() {
  const base = '/space/' + encodeURIComponent(authorId);
  const view = ['uploads', 'lists'].includes(params.get('tab')) ? params.get('tab') : keyword ? 'uploads' : 'home';
  const content = el('space-content');
  const url = (changes) => {
    const query = new URLSearchParams(changes);
    return base + '?' + query;
  };
  const videos = async (options = {}) => api('/videos?' + new URLSearchParams({ authorId, size: 20, sort: 'latest', ...options }));
  const grid = (entries) => {
    const result = node('div', 'space-grid');
    result.append(...entries.map((video) => {
      const result = card(video);
      result.querySelector('.card-byline').replaceChildren(video.publishedAt?.slice(0, 10) || '');
      return result;
    }));
    return result;
  };
  const section = (title, entries, href) => {
    const result = node('section', 'space-section');
    const heading = node('div', 'space-heading');
    heading.append(node('h2', '', title));
    if (href) heading.append(link(href, '查看更多 ›'));
    result.append(heading, entries.length ? grid(entries) : node('p', 'space-empty', '暂无公开视频'));
    return result;
  };
  try {
    const [author, collections] = await Promise.all([api('/authors/' + authorId), api('/authors/' + authorId + '/collections')]);
    el('author-name').textContent = author.name;
    el('author-level').textContent = author.level;
    el('author-signature').textContent = author.signature || '这个人很神秘，什么都没有写';
    el('author-uid').textContent = 'UID　' + author.id;
    el('author-following').textContent = shortCount(author.following);
    el('author-followers').textContent = shortCount(author.followers);
    el('author-birthday').hidden = !author.birthday;
    el('author-birthday').textContent = '生日　' + (author.birthday || '');
    const avatar = node('img');
    avatar.alt = author.name + '的头像';
    avatar.onerror = () => el('author-avatar').replaceChildren(node('span', '', Array.from(author.name || 'UP')[0]));
    el('author-avatar').replaceChildren(avatar);
    avatar.src = '/api/authors/' + author.id + '/avatar';
    document.title = author.name + '的个人空间 - 哔哩哔哩';
    el('space-tabs').replaceChildren(...[['home', '主页', 'tv'], ['uploads', '投稿 ' + author.videos, 'play'], ['lists', '合集和系列 ' + collections.length, 'list']].map(([key, label, symbol]) => {
      const a = link(url(key === 'home' ? {} : { tab: key }), label, key === view ? 'active' : '');
      a.prepend(icon(symbol));
      if (key === view) a.setAttribute('aria-current', 'page');
      return a;
    }));
    el('space-search').action = base;
    el('space-search').elements.keyword.value = keyword;
    content.replaceChildren();
    if (view === 'uploads') {
      const currentSort = params.get('sort') === 'popular' ? 'popular' : 'latest';
      const filters = node('nav', 'space-sort');
      for (const [key, label] of [['latest', '最新发布'], ['popular', '最多播放']]) {
        filters.append(link(url({ tab: 'uploads', keyword, sort: key, ...(params.get('collection') ? { collection: params.get('collection') } : {}) }), label, key === currentSort ? 'active' : ''));
      }
      const query = { page, sort: currentSort, q: keyword };
      if (params.get('collection')) query.compilationId = params.get('collection');
      const result = await videos(query);
      const collection = collections.find((entry) => entry.id === params.get('collection'));
      content.append(section(keyword ? '搜索：' + keyword : collection ? collection.title + ' · ' + collection.videos : '全部视频 · ' + author.videos, result.items));
      content.firstChild.firstChild.after(filters);
      const pagination = node('nav', 'pagination');
      pagination.setAttribute('aria-label', '投稿分页');
      if (page) pagination.append(link(url({ ...Object.fromEntries(params), tab: 'uploads', page: page - 1 }), '上一页', 'secondary'));
      if (page || result.hasMore) pagination.append(node('span', '', '第 ' + (page + 1) + ' 页'));
      if (result.hasMore) pagination.append(link(url({ ...Object.fromEntries(params), tab: 'uploads', page: page + 1 }), '下一页', 'secondary'));
      content.append(pagination);
    } else {
      if (view === 'home') {
        const featured = await videos({ sort: 'popular', size: 1 });
        content.append(section('代表作', featured.items));
        content.firstChild.classList.add('space-featured');
      }
      const blocks = await Promise.all(collections.map(async (collection) => {
        const result = await videos({ compilationId: collection.id, size: 5 });
        return section('合集·' + collection.title + ' · ' + collection.videos, result.items,
          url({ tab: 'uploads', collection: collection.id }));
      }));
      content.append(...blocks);
      if (view === 'home') {
        const recent = await videos({ size: 5 });
        content.append(section('最近发布', recent.items, url({ tab: 'uploads' })));
      } else if (!blocks.length) content.append(node('p', 'space-empty', '暂未创建合集和系列'));
    }
  } catch (error) {
    content.replaceChildren(node('p', 'space-empty', error.message === '404' ? '作者不存在，请返回首页选择其他作者' : '空间加载失败，请稍后重试'));
  }
}
