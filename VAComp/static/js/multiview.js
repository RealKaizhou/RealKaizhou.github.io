const section = document.querySelector('#multiview-results');
const slider = section.querySelector('#multiview-slider');
const output = section.querySelector('#multiview-position');
const status = section.querySelector('#multiview-status');
const videos = [...section.querySelectorAll('.multiview-video')];
const canvases = [...section.querySelectorAll('.multiview-canvas')];
const contexts = canvases.map(canvas => canvas.getContext('2d', { alpha: false }));
const thumbnail = document.createElement('canvas');
thumbnail.width = thumbnail.height = 110;
const thumbnailContext = thumbnail.getContext('2d', { alpha: false });
const byId = id => section.querySelector(`#${id}`);
const loadingProgress = byId('multiview-loading-progress');
const loadingPercent = byId('multiview-loading-percent');
const loadingStage = byId('multiview-loading-stage');
const sceneButtons = [...section.querySelectorAll('[data-multiview-scene]')];
const scenes = {
  dull: { label: 'doll 1', surface: 'doll.png' },
  dull_2: { label: 'doll 2', surface: 'doll.png' },
  brick: { label: 'brick', surface: 'brick.png' },
  pig_2: { label: 'pig', surface: 'pig.png' }
};
const blobCache = new Map();
let downloadController = new AbortController();
const videoURLs = [];
let generation = 0;
let totalBytes = 0;
let downloadedBytes = 0;
let sequence;
let requestedFrame = 0;
let displayedFrame = -1;
let updating = false;

function updateDownloadProgress(bytes, token) {
  if (token !== generation) return;
  downloadedBytes += bytes;
  const percent = Math.min(100, Math.floor(downloadedBytes / totalBytes * 100));
  loadingProgress.value = percent;
  loadingProgress.textContent = `${percent}%`;
  loadingPercent.textContent = `${percent}%`;
  if (percent === 100) loadingStage.textContent = 'Loading...';
}

async function loadVideo(video, token) {
  const source = video.dataset.src;
  const signal = downloadController.signal;
  let blob;
  if (blobCache.has(source)) {
    blob = blobCache.get(source);
    updateDownloadProgress(blob.size, token);
  } else {
    const response = await fetch(source, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not download ${video.dataset.method}`);
    if (response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        updateDownloadProgress(value.byteLength, token);
      }
      blob = new Blob(chunks, { type: 'video/mp4' });
    } else {
      blob = await response.blob();
      updateDownloadProgress(blob.size, token);
    }
    blobCache.set(source, blob);
  }
  if (token !== generation || signal.aborted) throw new DOMException('Scene changed', 'AbortError');
  const url = URL.createObjectURL(blob);
  videoURLs.push(url);
  await waitForVideo(video, 'loadeddata', () => video.readyState >= 2, () => {
    video.src = url;
    video.load();
  });
}

window.addEventListener('pagehide', event => {
  if (!event.persisted) {
    downloadController.abort();
    videoURLs.forEach(url => URL.revokeObjectURL(url));
  }
});

function waitForVideo(video, event, complete, action) {
  const signal = downloadController.signal;
  if (signal.aborted) return Promise.reject(new DOMException('Scene changed', 'AbortError'));
  if (complete()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Could not decode ${video.dataset.method}`)); };
    const onAbort = () => { cleanup(); reject(new DOMException('Scene changed', 'AbortError')); };
    const timer = setTimeout(onError, 15000);
    video.addEventListener(event, onReady);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (video.error) onError();
    else if (action) {
      try { action(); } catch (error) { cleanup(); reject(error); }
    }
  });
}

function updateTrajectory(frame) {
  const { x, y } = sequence.trajectory[frame];
  const left = x + (400 - x) * 0.12 - 55;
  const top = y - 215;
  byId('multiview-frustum').setAttribute('d', [
    `M${x} ${y} L${left} ${top}`,
    `M${x} ${y} L${left + 110} ${top}`,
    `M${x} ${y} L${left} ${top + 110}`,
    `M${x} ${y} L${left + 110} ${top + 110}`
  ].join(' '));
  for (const id of ['multiview-view-thumbnail', 'multiview-view-outline']) {
    byId(id).setAttribute('x', left);
    byId(id).setAttribute('y', top);
  }
  byId('multiview-view-point').setAttribute('cx', x);
  byId('multiview-view-point').setAttribute('cy', y);
  byId('multiview-view-label').setAttribute('x', x);
  byId('multiview-view-label').setAttribute('y', y + 50);
  if (videos[0].readyState >= 2) {
    thumbnailContext.drawImage(videos[0], 0, 0, 110, 110);
    byId('multiview-view-thumbnail').setAttribute('href', thumbnail.toDataURL('image/jpeg', 0.85));
  }
}

async function showRequestedFrame() {
  if (updating || !sequence) return;
  const token = generation;
  updating = true;
  try {
    while (token === generation && displayedFrame !== requestedFrame) {
      const frame = requestedFrame;
      // Seek to the middle of the exact source frame to avoid boundary rounding.
      const time = (frame + 0.5) / sequence.fps;
      await Promise.all(videos.map(video => waitForVideo(
        video,
        'seeked',
        () => !video.seeking && Math.abs(video.currentTime - time) < 0.001,
        () => { video.currentTime = time; }
      )));
      if (token !== generation) return;
      // Fast drags skip obsolete requests. Only publish a complete synchronized set.
      if (frame !== requestedFrame) continue;
      contexts.forEach((context, index) => {
        const video = videos[index];
        if (canvases[index].width !== video.videoWidth) canvases[index].width = video.videoWidth;
        if (canvases[index].height !== video.videoHeight) canvases[index].height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        canvases[index].dataset.frame = Math.floor(videos[index].currentTime * sequence.fps + 0.001);
      });
      updateTrajectory(frame);
      displayedFrame = frame;
      section.dataset.frame = frame;
      section.dataset.sourceFrame = frame;
      section.classList.add('is-ready');
      output.value = `View ${frame + 1} / ${sequence.frameCount}`;
      slider.setAttribute('aria-valuetext', `View ${frame + 1} of ${sequence.frameCount}`);
    }
    if (token === generation) status.textContent = '';
  } catch (error) {
    if (token !== generation || error.name === 'AbortError') return;
    status.textContent = 'This view could not load. Refresh the page to retry.';
    console.error(error);
  } finally {
    if (token === generation) updating = false;
  }
}

slider.addEventListener('input', () => {
  requestedFrame = Number(slider.value);
  showRequestedFrame();
});

async function initialize(sceneId = 'dull') {
  if (section.dataset.scene === sceneId && !section.dataset.loadError) return;
  const scene = scenes[sceneId];
  const token = ++generation;
  downloadController.abort();
  downloadController = new AbortController();
  videos.forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
  videoURLs.forEach(url => URL.revokeObjectURL(url));
  videoURLs.length = 0;
  sequence = undefined;
  requestedFrame = 0;
  displayedFrame = -1;
  updating = false;
  totalBytes = downloadedBytes = 0;
  slider.disabled = true;
  slider.value = 0;
  slider.setAttribute('aria-valuetext', 'Preparing the selected scene');
  section.dataset.scene = sceneId;
  delete section.dataset.frame;
  delete section.dataset.sourceFrame;
  delete section.dataset.loadError;
  section.classList.remove('is-ready');
  status.textContent = '';
  loadingProgress.value = 0;
  loadingProgress.textContent = loadingPercent.textContent = '0%';
  loadingStage.textContent = 'Loading...';
  output.value = 'View —';
  sceneButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.multiviewScene === sceneId)));
  const base = `static/videos/demo/web/${sceneId}/`;
  videos.forEach(video => {
    video.dataset.src = `${base}${video.dataset.method}.mp4`;
    video.closest('figure').querySelector('.multiview-poster').src = `${base}${video.dataset.method}.jpg`;
  });
  byId('multiview-surface').setAttribute('href', `static/videos/demo/images/${scene.surface}`);
  byId('multiview-view-thumbnail').setAttribute('href', `${base}surface.jpg`);
  try {
    const response = await fetch(`${base}sequence.json`, { signal: downloadController.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load viewing sequence');
    const metadata = await response.json();
    if (token !== generation) return;
    sequence = metadata;
    totalBytes = sequence.methods.reduce((sum, method) => sum + method.bytes, 0);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('Missing video sizes');
    slider.max = sequence.frameCount - 1;
    byId('multiview-path').setAttribute('d', sequence.curve.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' '));
    updateTrajectory(0);
    await Promise.all(videos.map(video => loadVideo(video, token)));
    if (token !== generation) return;
    await showRequestedFrame();
    if (token !== generation) return;
    if (!section.classList.contains('is-ready')) throw new Error('Could not prepare synchronized views');
    slider.disabled = false;
    loadingStage.textContent = 'Ready';
  } catch (error) {
    if (token !== generation || error.name === 'AbortError') return;
    section.dataset.loadError = 'true';
    downloadController.abort();
    loadingStage.textContent = 'Loading interrupted';
    status.textContent = 'The multiview demo could not load. Refresh the page to retry.';
    console.error(error);
  }
}

sceneButtons.forEach(button => button.addEventListener('click', () => initialize(button.dataset.multiviewScene)));
initialize();
