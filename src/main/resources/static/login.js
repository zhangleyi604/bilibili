const loginPopup = el('login-popover');
const loginDialog = el('login-dialog');
const loginForm = el('login-form');
const password = el('login-password');
let popupTimer;
let loginTrigger;

function hideLoginPopup() {
  clearTimeout(popupTimer);
  loginPopup.hidden = true;
}

function showLoginPopup(button) {
  if (loginDialog.open) return;
  clearTimeout(popupTimer);
  loginTrigger = button;
  const full = button.dataset.login === '登录';
  const upload = button.dataset.login === '投稿';
  el('login-popover-title').textContent = full ? '登录后你可以：' : {
    消息: '登录即可查看消息', 收藏: '登录即可查看我的收藏', 历史: '登录即可查看历史记录',
  }[button.dataset.login] || '';
  el('login-prompt').hidden = upload;
  el('upload-actions').hidden = !upload;
  el('login-benefits').hidden = !full;
  el('popover-register').hidden = !full;
  loginPopup.classList.toggle('compact', !full && !upload);
  loginPopup.classList.toggle('upload-menu', upload);
  loginPopup.setAttribute('aria-label', upload ? '投稿入口' : '登录提示');
  loginPopup.hidden = false;
  const rect = button.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - loginPopup.offsetWidth / 2,
    document.documentElement.clientWidth - loginPopup.offsetWidth - 12));
  loginPopup.style.left = left + window.scrollX + 'px';
  loginPopup.style.top = rect.bottom + window.scrollY + 14 + 'px';
}

function openLogin(button = loginTrigger) {
  loginTrigger = button;
  hideLoginPopup();
  el('login-message').textContent = '';
  loginDialog.showModal();
}

function delayHidePopup() {
  clearTimeout(popupTimer);
  popupTimer = setTimeout(hideLoginPopup, 160);
}

document.querySelectorAll('[data-login]').forEach((button) => {
  button.addEventListener('click', () => openLogin(button));
  if (button.dataset.login === '创作中心' || button.closest('.space-actions') || button.hasAttribute('data-login-only')) return;
  button.addEventListener('mouseenter', () => showLoginPopup(button));
  button.addEventListener('mouseleave', delayHidePopup);
  button.addEventListener('focus', () => showLoginPopup(button));
  button.addEventListener('blur', (event) => {
    if (!loginPopup.contains(event.relatedTarget)) delayHidePopup();
  });
});
loginPopup.addEventListener('mouseenter', () => clearTimeout(popupTimer));
loginPopup.addEventListener('mouseleave', delayHidePopup);
loginPopup.addEventListener('focusin', () => clearTimeout(popupTimer));
loginPopup.addEventListener('focusout', (event) => {
  if (!loginPopup.contains(event.relatedTarget)) delayHidePopup();
});
document.querySelectorAll('#popover-login, #upload-actions button').forEach((button) => {
  button.onclick = () => openLogin();
});
el('close-login').onclick = () => loginDialog.close();
loginDialog.addEventListener('click', (event) => {
  if (event.target !== loginDialog) return;
  const rect = loginDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) loginDialog.close();
});
loginDialog.addEventListener('close', () => {
  loginForm.reset();
  password.type = 'password';
  el('toggle-password').textContent = '显示';
  el('toggle-password').setAttribute('aria-pressed', 'false');
  setMascots(false);
  loginTrigger?.focus({ preventScroll: true });
  hideLoginPopup();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideLoginPopup();
});
window.addEventListener('resize', hideLoginPopup);

function setMascots(coverEyes) {
  const state = coverEyes ? 'close' : 'open';
  document.querySelector('.mascot-left').src = '/assets/login-22-' + state + '.png';
  document.querySelector('.mascot-right').src = '/assets/login-33-' + state + '.png';
}
password.addEventListener('focus', () => setMascots(true));
password.addEventListener('blur', () => setMascots(false));
el('toggle-password').onclick = (event) => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? '隐藏' : '显示';
  event.currentTarget.setAttribute('aria-pressed', String(show));
  password.focus();
};
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  el('login-message').textContent = '登录服务暂未开放，请稍后再试';
});
