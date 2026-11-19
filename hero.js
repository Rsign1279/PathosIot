/* The original marble film, deferred until the first paint. The visitor's
   playback choice survives automatic visibility pauses and source changes. */
const hero = document.getElementById('hero');
const video = document.getElementById('heroVideo');

if (hero && video) {
  const tall = matchMedia('(max-aspect-ratio: 4/5)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sources = { land: 'assets/hero/hero.mp4', port: 'assets/hero/hero-portrait.mp4' };
  const posters = { land: 'assets/hero/hero-poster.webp', port: 'assets/hero/hero-poster-portrait.webp' };
  let kind = '', loadedKind = '', painted = false, onScreen = false;
  let pending = false, blocked = false, attempt = 0, retryTimer = 0, retries = 0;
  let userPaused = false, motionOverride = false;

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'hero-film-control';
  control.setAttribute('aria-controls', video.id);
  (hero.querySelector('.hero-inner') || hero).append(control);

  const eligible = () => painted && onScreen && !document.hidden && !userPaused && (!reduced.matches || motionOverride);
  const syncControl = () => {
    control.textContent = !blocked && (!video.paused || pending) ? 'Pause background film' : 'Play background film';
  };
  const clearRetry = () => { clearTimeout(retryTimer); retryTimer = 0; };
  const pause = () => {
    clearRetry();
    attempt++;
    pending = false;
    video.pause();
    syncControl();
  };
  const showRetry = () => {
    blocked = true;
    video.style.visibility = 'hidden';
    pause();
  };
  const scheduleRetry = () => {
    if (!eligible() || blocked || retryTimer || retries >= 3) return;
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      if (!eligible() || blocked) return;
      retries++;
      tryPlay();
      if (video.paused || video.readyState < 3) scheduleRetry();
    }, 1500);
  };
  const tryPlay = () => {
    if (!eligible() || blocked || pending) return;
    if (loadedKind !== kind) {
      loadedKind = kind;
      video.src = sources[kind];
      video.load();
    } else if (!video.paused) return;
    const currentAttempt = ++attempt;
    pending = true;
    syncControl();
    Promise.resolve(video.play()).then(() => {
      if (currentAttempt !== attempt) return;
      pending = false;
      if (!eligible()) pause();
      else syncControl();
    }).catch(error => {
      if (currentAttempt !== attempt) return;
      pending = false;
      syncControl();
      if (!eligible()) return;
      if (error.name === 'AbortError') scheduleRetry();
      else showRetry();
    });
  };
  const update = () => {
    video.style.visibility = (reduced.matches && !motionOverride) || blocked ? 'hidden' : '';
    if (eligible()) tryPlay();
    else pause();
    syncControl();
  };
  const pick = () => {
    const next = tall.matches ? 'port' : 'land';
    if (next !== kind) {
      pause();
      kind = next;
      video.poster = posters[kind];
    }
    update();
  };

  control.addEventListener('click', () => {
    if (!blocked && (!video.paused || pending)) {
      userPaused = true;
      pause();
    } else {
      userPaused = false;
      motionOverride = true;
      blocked = false;
      retries = 0;
      if (video.error) loadedKind = '';
      update();
    }
  });
  const motionChanged = () => { motionOverride = false; update(); };
  pick();
  tall.addEventListener ? tall.addEventListener('change', pick) : tall.addListener(pick);
  reduced.addEventListener ? reduced.addEventListener('change', motionChanged) : reduced.addListener(motionChanged);
  new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    update();
  }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', update);
  video.addEventListener('canplay', tryPlay);
  video.addEventListener('playing', () => {
    retries = 0;
    clearRetry();
    if (eligible()) video.style.visibility = '';
    else pause();
    syncControl();
  });
  video.addEventListener('timeupdate', () => { retries = 0; clearRetry(); });
  video.addEventListener('waiting', scheduleRetry);
  video.addEventListener('stalled', scheduleRetry);
  video.addEventListener('pause', () => { syncControl(); scheduleRetry(); });
  video.addEventListener('error', () => { if (eligible()) showRetry(); });

  // Nested frames let the still, heading and primary action paint first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    painted = true;
    update();
  }));
}
