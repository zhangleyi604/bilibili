function startViewerPresence(videoId) {
  const label = document.getElementById('online-viewers');
  const sessionId = crypto.randomUUID();
  const url = '/api/videos/' + encodeURIComponent(videoId) + '/viewers';
  let timer, pending = false, stopped = false;
  const payload = active => JSON.stringify({ sessionId, active });
  async function heartbeat() {
    if (pending || stopped || document.hidden) return;
    pending = true;
    try {
      const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:payload(true), cache:'no-store' });
      if (!response.ok) throw new Error('presence unavailable');
      const data = await response.json();
      if (!Number.isInteger(data.count) || data.count < 0) throw new Error('invalid viewer count');
      label.textContent = data.count + '人正在看'; label.removeAttribute('title');
    } catch { label.textContent = '—人正在看'; label.title = '在线观看人数暂时不可用'; }
    finally { pending = false; }
  }
  function leave() {
    const body = payload(false);
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], {type:'application/json'}))) return;
    fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  }
  function start() { stopped = false; clearInterval(timer); heartbeat(); timer = setInterval(heartbeat, 15_000); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); else heartbeat(); });
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); leave(); });
  window.addEventListener('pageshow', event => { if (event.persisted) start(); });
  start();
}
