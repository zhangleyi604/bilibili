async function setupWatchComments(videoId) {
  const list = el('comment-list');
  let requestVersion = 0;
  const loginButton = (text, className='') => { const button=node('button',className,text);button.onclick=()=>openLogin(button);return button; };
  const svg = name => { const element=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS(element.namespaceURI,'use');use.setAttribute('href','/assets/watch-icons.svg#'+name);element.setAttribute('aria-hidden','true');element.append(use);return element; };
  function avatar(entry) {
    const a=link('/space/'+encodeURIComponent(entry.userId),null,'comment-avatar');
    const img=node('img');img.alt=entry.author;img.loading='lazy';img.src='/api/authors/'+encodeURIComponent(entry.userId)+'/avatar';
    img.onerror=()=>{img.hidden=true;a.textContent=entry.author.slice(0,1);};a.append(img);return a;
  }
  function renderEntry(entry, reply=false) {
    const article=node('article',reply?'comment-reply':'comment-entry'),body=node('div','comment-body');
    const byline=node('div','comment-byline');byline.append(link('/space/'+encodeURIComponent(entry.userId),entry.author));
    if(entry.level)byline.append(node('span','comment-level',entry.level));
    const content=node('p','comment-content',entry.content),actions=node('div','comment-actions');
    actions.append(node('time','',(entry.sentAt||'').replace('T',' ').slice(0,16)));
    const like=loginButton(shortCount(entry.likes));like.setAttribute('aria-label','点赞');like.prepend(svg('like-outline'));
    const more=loginButton('⋮','comment-options');more.setAttribute('aria-label','评论更多操作');
    actions.append(like,loginButton('回复'),more);body.append(byline,content,actions);article.append(avatar(entry),body);
    if(!reply) {
      const previews=node('div','comment-replies');
      (entry.replies||[]).slice(0,2).forEach(r=>previews.append(renderEntry(r,true)));
      if(entry.replyCount>0)previews.append(loginButton('共'+entry.replyCount+'条回复，点击查看','comment-view-replies'));
      body.append(previews);
    }
    return article;
  }
  async function load(sort) {
    const version=++requestVersion;
    el('comments-hot').setAttribute('aria-pressed',String(sort==='hot'));el('comments-latest').setAttribute('aria-pressed',String(sort==='latest'));
    list.textContent='正在加载评论…';el('comments-more').hidden=true;
    try {
      const data=await api('/videos/'+encodeURIComponent(videoId)+'/comments?sort='+sort);if(version!==requestVersion)return;
      el('comment-total').textContent=shortCount(data.total);
      list.replaceChildren(...data.items.slice(0,2).map(c=>renderEntry(c)));
      if(!data.items.length)list.append(node('p','comments-empty','还没有评论，登录后发条评论吧'));
      el('comments-more').textContent='登录后查看 '+data.total+' 条评论';el('comments-more').hidden=data.total===0;
    }catch {if(version===requestVersion)list.textContent='评论加载失败，请刷新重试';}
  }
  el('comments-hot').onclick=()=>load('hot');el('comments-latest').onclick=()=>openLogin(el('comments-latest'));
  await load('hot');
}

function setupRelatedExpansion(videos) {
  const first=videos.slice(0,12),extra=videos.slice(12);
  el('related-videos').replaceChildren(...first.map(card));el('related-extra').replaceChildren(...extra.map(card));
  el('related-expand').hidden=extra.length===0;
  el('related-expand').onclick=()=>{el('related-extra').hidden=false;el('related-expand').hidden=true;el('related-collapse').hidden=false;};
  el('related-collapse').onclick=()=>{
    const anchor=el('related-videos').getBoundingClientRect().bottom;
    el('related-extra').hidden=true;el('related-expand').hidden=false;el('related-collapse').hidden=true;
    if(anchor<80)el('related-expand').scrollIntoView({block:'end',behavior:'smooth'});
  };
}

function setupWatchScroll(player,shell) {
  const home=el('player-shell-home'),main=document.querySelector('.watch-main');home.append(shell);
  let floating=false, dismissed=false, manualPosition=null, drag=null;
  function measure(){main.style.setProperty('--watch-main-height',main.offsetHeight+'px');}
  const resize=new ResizeObserver(measure);resize.observe(main);measure();
  function restore(){
    if(!floating)return;floating=false;shell.classList.remove('scroll-mini');home.append(shell);home.style.height='';shell.style.removeProperty('left');shell.style.removeProperty('top');shell.style.removeProperty('right');shell.style.removeProperty('bottom');
  }
  function float(){
    if(floating||dismissed||document.fullscreenElement||shell.classList.contains('web-full')||window.innerWidth<801)return;
    home.style.height=home.getBoundingClientRect().height+'px';document.body.append(shell);shell.classList.add('scroll-mini');floating=true;
    if(manualPosition){shell.style.left=manualPosition.x+'px';shell.style.top=manualPosition.y+'px';shell.style.right='auto';shell.style.bottom='auto';}
  }
  const observer=new IntersectionObserver(entries=>{
    const entry=entries[0];
    if(entry.isIntersecting||entry.boundingClientRect.top>0){restore();dismissed=false;}
    else float();
  },{rootMargin:'-76px 0px 0px 0px',threshold:0});observer.observe(home);
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)restore();});
  el('mini-close').onclick=()=>{dismissed=true;restore();};
  const handle=el('mini-drag-handle');
  handle.addEventListener('pointerdown',event=>{
    if(!floating||event.button!==0)return;
    const rect=shell.getBoundingClientRect();drag={x:event.clientX-rect.left,y:event.clientY-rect.top};handle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  handle.addEventListener('pointermove',event=>{
    if(!drag)return;
    const x=Math.max(0,Math.min(window.innerWidth-shell.offsetWidth,event.clientX-drag.x));
    const y=Math.max(0,Math.min(window.innerHeight-shell.offsetHeight,event.clientY-drag.y));
    manualPosition={x,y};shell.style.left=x+'px';shell.style.top=y+'px';shell.style.right='auto';shell.style.bottom='auto';
  });
  function end(){drag=null;}handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  window.addEventListener('resize',()=>{measure();if(window.innerWidth<801)restore();else if(floating&&manualPosition){manualPosition.x=Math.min(manualPosition.x,window.innerWidth-shell.offsetWidth);manualPosition.y=Math.max(0,Math.min(manualPosition.y,window.innerHeight-shell.offsetHeight));shell.style.left=manualPosition.x+'px';shell.style.top=manualPosition.y+'px';}});
  window.addEventListener('pagehide',()=>{observer.disconnect();resize.disconnect();},{once:true});
}
