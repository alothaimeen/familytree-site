'use strict';
const manifest = JSON.parse(document.getElementById('viewer-manifest').textContent);
const viewport = document.getElementById('viewport');
const paper = document.getElementById('paper');
const tree = document.getElementById('tree');
const decoration = document.getElementById('decoration');
const nodes = [...tree.querySelectorAll('.person')];
const card = document.getElementById('person-card');
const searchInput = document.getElementById('search');
const results = document.getElementById('search-results');
const pointers = new Map();
let scale = 1, fitScale = 1, tx = 0, ty = 0, initialized = false;
let pointerStart = null, pinch = null, gestureMoved = false, selected = null;
let desiredWidth = 1200, currentScreen = manifest.screens[0].url, noticeTimer;
let printing = false, lastTap = null, imageSerial = 0;
if (navigator.maxTouchPoints > 0) document.body.classList.add('is-touch');

function notify(message) {
  const notice = document.getElementById('notice');
  notice.textContent = message; notice.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
}
function localPoint(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}
function fitGeometry() {
  const padding = viewport.clientWidth < 600 ? 17 : 26;
  const top = 51, bottom = 82;
  const availableHeight = Math.max(100, viewport.clientHeight - top - bottom);
  return { top, availableHeight, scale: Math.max(.025, Math.min(
    (viewport.clientWidth - padding * 2) / manifest.width, availableHeight / manifest.height)) };
}
function clampTranslation() {
  const width = manifest.width * scale, height = manifest.height * scale;
  const inset = 22;
  tx = width < viewport.clientWidth ? (viewport.clientWidth - width) / 2
    : Math.max(viewport.clientWidth - width - inset, Math.min(inset, tx));
  const fitArea = fitGeometry();
  ty = height <= fitArea.availableHeight + .5 ? fitArea.top + (fitArea.availableHeight - height) / 2
    : Math.max(viewport.clientHeight - height - inset, Math.min(inset, ty));
}
function updateResolution() {
  if (printing) return;
  const pixels = manifest.width * scale * Math.min(window.devicePixelRatio || 1, 3);
  const asset = manifest.screens.find(a => a.width >= pixels) || manifest.screens[manifest.screens.length - 1];
  if (asset.width <= desiredWidth) return;
  desiredWidth = asset.width;
  const request = ++imageSerial;
  const image = new Image(); image.src = asset.url;
  image.onload = () => {
    if (request !== imageSerial) return;
    currentScreen = asset.url;
    if (!printing) decoration.src = asset.url;
  };
}
function render() {
  clampTranslation();
  paper.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  paper.dataset.scale = String(scale);
  document.getElementById('zoom-value').value = Math.round(scale / fitScale * 100) + '%';
  document.getElementById('zoom-out').disabled = scale <= fitScale * .76;
  document.getElementById('zoom-in').disabled = scale >= Math.max(1.5, fitScale * 12) * .995;
  updateResolution();
}
function fit() {
  const area = fitGeometry();
  fitScale = area.scale;
  scale = fitScale; tx = (viewport.clientWidth - manifest.width * scale) / 2;
  ty = area.top + (area.availableHeight - manifest.height * scale) / 2;
  initialized = true; render();
}
function zoomTo(next, anchor = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }) {
  const bounded = Math.max(fitScale * .75, Math.min(Math.max(1.5, fitScale * 12), next));
  const worldX = (anchor.x - tx) / scale, worldY = (anchor.y - ty) / scale;
  scale = bounded; tx = anchor.x - worldX * scale; ty = anchor.y - worldY * scale;
  render();
}
function closeCard() {
  card.hidden = true;
  if (selected) selected.classList.remove('is-selected');
  selected = null;
}
function selectNode(node, focusOnNode = false) {
  if (selected) selected.classList.remove('is-selected');
  selected = node; selected.classList.add('is-selected');
  document.getElementById('person-name').textContent = node.querySelector('text').textContent;
  document.getElementById('person-lineage').textContent = node.getAttribute('aria-label');
  card.hidden = false; hideResults();
  if (focusOnNode) {
    const match = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(node.getAttribute('transform'));
    scale = Math.min(Math.max(1.5, fitScale * 12), Math.max(scale, fitScale * 3.4));
    tx = viewport.clientWidth * .5 - Number(match[1]) * scale;
    ty = viewport.clientHeight * .32 - Number(match[2]) * scale;
    render();
  }
}
function hideResults() { results.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); }
function normalize(value) { return value.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').trim(); }
function search() {
  const query = normalize(searchInput.value);
  document.getElementById('clear-search').hidden = !query;
  results.replaceChildren();
  const matches = [];
  for (const node of nodes) {
    const name = normalize(node.querySelector('text').textContent);
    const full = normalize(node.getAttribute('aria-label'));
    const hit = !!query && (name.includes(query) || full.startsWith(query));
    node.classList.toggle('hit', hit);
    if (hit) matches.push(node);
  }
  if (!query) { hideResults(); document.getElementById('search-status').textContent = ''; return; }
  for (const node of matches) {
    const button = document.createElement('button'); button.className = 'result-button';
    const name = document.createElement('strong'); name.textContent = node.querySelector('text').textContent;
    const lineage = document.createElement('small'); lineage.textContent = node.getAttribute('aria-label');
    button.append(name, lineage);
    button.addEventListener('click', () => { searchInput.blur(); selectNode(node, true); });
    results.append(button);
  }
  if (!matches.length) {
    const empty = document.createElement('p'); empty.className = 'empty-results';
    empty.textContent = 'لم يُعثر على اسم مطابق'; results.append(empty);
  }
  results.hidden = false; searchInput.setAttribute('aria-expanded', 'true');
  document.getElementById('search-status').textContent = `${matches.length} نتيجة`;
}
searchInput.addEventListener('input', search);
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) search(); });
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideResults();
  if (event.key === 'Enter') { const first = results.querySelector('button'); if (first) first.click(); }
});
document.getElementById('clear-search').onclick = () => { searchInput.value = ''; search(); searchInput.focus(); };
document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) hideResults(); });
document.getElementById('close-person').onclick = closeCard;
document.getElementById('zoom-in').onclick = () => zoomTo(scale * 1.5);
document.getElementById('zoom-out').onclick = () => zoomTo(scale / 1.5);
document.getElementById('fit').onclick = () => { closeCard(); fit(); };
tree.addEventListener('keydown', event => {
  const node = event.target.closest('.person');
  if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeCard(); hideResults(); }
  if (event.target.matches('input,textarea') || event.ctrlKey || event.metaKey) return;
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(scale * 1.5); }
  if (event.key === '-') { event.preventDefault(); zoomTo(scale / 1.5); }
  if (event.key === '0') fit();
});

function startPinch() {
  const [a, b] = [...pointers.values()];
  const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
  pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale,
    worldX: (midpoint.x - tx) / scale, worldY: (midpoint.y - ty) / scale };
  gestureMoved = true;
}
viewport.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  hideResults();
  viewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    gestureMoved = false;
    pointerStart = { x: event.clientX, y: event.clientY, tx, ty,
      node: event.target.closest('.person') };
  } else if (pointers.size === 2) startPinch();
});
viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    scale = Math.max(fitScale * .75, Math.min(Math.max(1.5, fitScale * 12),
      pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
    tx = midpoint.x - pinch.worldX * scale; ty = midpoint.y - pinch.worldY * scale;
    render();
  } else if (pointerStart) {
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) > 7) { gestureMoved = true; viewport.classList.add('dragging'); }
    if (gestureMoved) { tx = pointerStart.tx + dx; ty = pointerStart.ty + dy; render(); }
  }
});
function endPointer(event) {
  const existed = pointers.has(event.pointerId);
  pointers.delete(event.pointerId);
  if (!existed) return;
  if (!pointers.size) {
    if (!gestureMoved && pointerStart && event.type !== 'pointercancel') {
      const point = localPoint(event.clientX, event.clientY);
      const now = Date.now();
      if (pointerStart.node) { selectNode(pointerStart.node); lastTap = null; }
      else if (lastTap && now - lastTap.time < 330 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 30) {
        zoomTo(scale * 2, point); lastTap = null;
      } else { closeCard(); lastTap = { ...point, time: now }; }
    }
    pointerStart = null; pinch = null; viewport.classList.remove('dragging');
  } else if (pointers.size === 1) {
    const point = [...pointers.values()][0];
    pointerStart = { x: point.x, y: point.y, tx, ty, node: null }; pinch = null;
  }
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('wheel', event => {
  event.preventDefault(); zoomTo(scale * Math.exp(-event.deltaY * .0015), localPoint(event.clientX, event.clientY));
}, { passive: false });

function ready() { viewport.classList.add('ready'); document.getElementById('loading').hidden = true; }
decoration.addEventListener('load', ready);
decoration.addEventListener('error', () => {
  document.getElementById('loading').textContent = 'تعذّر تحميل الرسم. تحقّق من الاتصال ثم أعد تحميل الصفحة.';
});
if (decoration.complete && decoration.naturalWidth) ready();
new ResizeObserver(() => {
  if (!initialized || scale <= fitScale * 1.01) { fit(); return; }
  fitScale = fitGeometry().scale;
  render();
}).observe(viewport);
fit();

function restoreScreen() {
  printing = false; decoration.src = currentScreen;
}
window.addEventListener('beforeprint', () => {
  printing = true;
});
window.addEventListener('afterprint', restoreScreen);
document.getElementById('print').onclick = () => window.print();
document.getElementById('download').onclick = async () => {
  const button = document.getElementById('download'); button.disabled = true;
  notify('جارٍ تجهيز PDF عالي الدقة…');
  try {
    const { createTreePdf } = await import(new URL(manifest.pdf_module, document.baseURI).href);
    const blob = await createTreePdf(manifest);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'شجرة-آل-مسلم.pdf'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); notify('تم تجهيز ملف PDF للتنزيل');
  } catch { notify('تعذّر التنزيل. حاول مرة أخرى بعد التحقق من الاتصال.'); }
  finally { button.disabled = false; }
};
