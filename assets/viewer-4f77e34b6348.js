'use strict';
const manifest = JSON.parse(document.getElementById('viewer-manifest').textContent);
const viewport = document.getElementById('viewport');
const paper = document.getElementById('paper');
const tree = document.getElementById('tree');
const decoration = document.getElementById('decoration');
const card = document.getElementById('person-card');
const people = [...tree.querySelectorAll('.person')];
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
  const padding = 2;
  const top = padding;
  const availableHeight = Math.max(100, viewport.clientHeight - padding * 2);
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
  if (printing || scale <= fitScale * 1.01) return;
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
  document.getElementById('zoom-out').disabled = scale <= fitScale * 1.01;
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
  const bounded = Math.max(fitScale, Math.min(Math.max(1.5, fitScale * 12), next));
  const worldX = (anchor.x - tx) / scale, worldY = (anchor.y - ty) / scale;
  scale = bounded; tx = anchor.x - worldX * scale; ty = anchor.y - worldY * scale;
  render();
}
function closeCard() {
  card.hidden = true;
  if (selected) selected.classList.remove('is-selected');
  selected = null;
}
function selectNode(node) {
  if (selected) selected.classList.remove('is-selected');
  selected = node; selected.classList.add('is-selected');
  document.getElementById('person-name').textContent = node.querySelector('text').textContent;
  document.getElementById('person-lineage').textContent = node.getAttribute('aria-label');
  card.hidden = false;
}
function personAtPoint(target, x, y, pointerType) {
  const direct = target.closest('.person');
  if (direct) return direct;
  const padding = pointerType === 'touch' ? 10 : pointerType === 'pen' ? 6 : 2;
  let nearest = null, nearestDistance = Infinity;
  for (const person of people) {
    const rect = person.getBoundingClientRect();
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    if (Math.abs(dx) > rect.width / 2 + padding || Math.abs(dy) > rect.height / 2 + padding) continue;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) { nearest = person; nearestDistance = distance; }
  }
  return nearest;
}
document.getElementById('close-person').onclick = closeCard;
document.getElementById('zoom-in').onclick = () => zoomTo(scale * 1.5);
document.getElementById('zoom-out').onclick = () => zoomTo(scale / 1.5);
document.getElementById('fit').onclick = () => { closeCard(); fit(); };
tree.addEventListener('keydown', event => {
  const node = event.target.closest('.person');
  if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node); }
});
tree.addEventListener('click', event => {
  const node = event.target.closest('.person');
  // Keyboard and assistive activation may produce a click without pointer events.
  if (node && (event.detail === 0 || !gestureMoved)) selectNode(node);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCard();
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
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    gestureMoved = false;
    pointerStart = { x: event.clientX, y: event.clientY, tx, ty,
      threshold: event.pointerType === 'touch' ? 12 : 7,
      node: personAtPoint(event.target, event.clientX, event.clientY, event.pointerType) };
  } else if (pointers.size === 2) startPinch();
  // Keep tracking taps even when a browser cannot capture this pointer.
  try { viewport.setPointerCapture?.(event.pointerId); } catch {}
});
viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    scale = Math.max(fitScale, Math.min(Math.max(1.5, fitScale * 12),
      pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
    tx = midpoint.x - pinch.worldX * scale; ty = midpoint.y - pinch.worldY * scale;
    render();
  } else if (pointerStart) {
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) > pointerStart.threshold) { gestureMoved = true; viewport.classList.add('dragging'); }
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
        if (scale > fitScale * 1.05) fit();
        else zoomTo(scale * 2, point);
        lastTap = null;
      } else { closeCard(); lastTap = { ...point, time: now }; }
    }
    pointerStart = null; pinch = null; viewport.classList.remove('dragging');
  } else if (pointers.size === 1) {
    const point = [...pointers.values()][0];
    pointerStart = { x: point.x, y: point.y, tx, ty, threshold: 12, node: null }; pinch = null;
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
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
document.getElementById('copy-link').onclick = async () => {
  const url = document.querySelector('link[rel="canonical"]').href;
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {}
  notify(copied ? 'نُسخ رابط الشجرة كاملًا' : 'اضغط مطولًا على الرابط لنسخه أو مشاركته');
  const link = document.createElement('a'); link.href = url; link.textContent = url;
  document.getElementById('notice').append(document.createElement('br'), link);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { document.getElementById('notice').hidden = true; }, 15000);
};
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
