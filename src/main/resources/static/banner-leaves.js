(() => {
  const banner = document.querySelector('.banner');
  const browsePage = location.pathname === '/' || location.pathname === '/index.html' || location.pathname.startsWith('/channel/');
  if (!banner || !browsePage) return;

  const layer = document.createElement('div');
  layer.className = 'banner-leaves';
  layer.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg';
  const colors = ['#d69a4c', '#b96336', '#c7813f', '#a96b38', '#d7ad61', '#aa5134'];
  const shapes = [
    // Maple silhouette, with a tapered stem and irregular lobes.
    ['M17 31l-1-9-5 3 1-6-8-1 4-5-4-4 8 1 1-7 4 5 3-7 2 9 7-3-2 7 5 2-8 4 1 5-7-3 1 9Z', 'M17 29L17 9M17 20L9 13M17 20l8-7'],
    // A slender leaf provides a second shape among the maple leaves.
    ['M16 29C5 25 2 15 6 5c10-2 21 3 22 10 1 7-5 12-11 13l1 4-2 1Z', 'M17 30L8 7m7 15-5-3m3-4 6-3m-3 11 6-4'],
  ];
  const random = (min, max) => min + Math.random() * (max - min);
  const svgPath = (d, className) => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    if (className) path.setAttribute('class', className);
    return path;
  };

  for (let i = 0; i < 22; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'banner-leaf';
    const duration = random(7, 13);
    const values = {
      '--leaf-left': `${(i + Math.random()) / 22 * 100}%`,
      '--leaf-size': `${random(12, 23)}px`,
      '--leaf-opacity': random(.45, .8).toFixed(2),
      '--leaf-drift': `${random(25, 100)}px`,
      '--leaf-rotation': `${random(-100, 100)}deg`,
      '--fall-duration': `${duration}s`,
      '--fall-delay': `${-random(0, duration)}s`,
      '--sway-duration': `${random(1.8, 3.5)}s`,
      '--turn-duration': `${random(2.5, 5)}s`,
      '--sway-delay': `${-random(0, 5)}s`,
    };
    Object.entries(values).forEach(([key, value]) => leaf.style.setProperty(key, value));
    leaf.style.color = colors[i % colors.length];
    const sway = document.createElement('span');
    sway.className = 'banner-leaf-sway';
    const turn = document.createElement('span');
    turn.className = 'banner-leaf-shape';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 34 34');
    svg.setAttribute('focusable', 'false');
    const [outline, veins] = shapes[i % shapes.length];
    svg.append(svgPath(outline), svgPath(veins, 'leaf-vein'));
    turn.append(svg);
    sway.append(turn);
    leaf.append(sway);
    layer.append(leaf);
  }
  banner.prepend(layer);
  const resize = new ResizeObserver(() => layer.style.setProperty('--leaf-travel', `${banner.clientHeight + 56}px`));
  resize.observe(banner);

  let visible = true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const updatePlayback = () => layer.classList.toggle('is-paused', document.hidden || !visible || motion.matches);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updatePlayback();
  });
  observer.observe(banner);
  document.addEventListener('visibilitychange', updatePlayback);
  motion.addEventListener('change', updatePlayback);
  updatePlayback();
})();
