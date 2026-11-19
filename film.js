/* The original PATHOS film. Its poster loads first; video preparation begins
   near the viewport. Native controls remain available, including when a
   browser blocks autoplay or the visitor prefers reduced motion. */
const stage = document.getElementById('filmStage');
const video = document.getElementById('filmVideo');
const bar = document.getElementById('filmScrub');

if (stage && video) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let onScreen = false, near = false, prepared = false, userPaused = false;
  let internalPause = false, blocked = false, pending = false, attempt = 0, motionOverride = false;
  let frame = 0, videoFrame = false, retryTimer = 0, retries = 0;
  const scrub = bar?.parentElement;
  const seek = scrub ? document.createElement('input') : null;
  if (seek) {
    seek.type = 'range';seek.className = 'film-seek';
    seek.min = '0';seek.max = '1000';seek.step = '1';seek.value = '0';seek.disabled = true;
    seek.setAttribute('aria-label', 'Seek in project film');
    seek.setAttribute('aria-controls', video.id);
    scrub.removeAttribute('aria-hidden');
    bar.setAttribute('aria-hidden', 'true');
    scrub.append(seek);stage.classList.add('film-stage--seekable');
  }

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = true;
  video.preload = 'none';
  video.setAttribute('aria-label', 'Pathos IoT in 44 seconds');

  const eligible = () => prepared && onScreen && !document.hidden && (!reduced.matches || motionOverride) && !userPaused && !blocked;
  const clearRetry = () => { clearTimeout(retryTimer); retryTimer = 0; };
  const timeLabel = value => {
    const seconds = Math.max(0, Math.floor(value));
    return seconds < 60 ? `${seconds} seconds` : `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`;
  };
  const drawBar = () => {
    const available = Number.isFinite(video.duration) && video.duration > 0;
    if (seek) seek.disabled = !available;
    if (bar && available) {
      const progress = Math.max(0, Math.min(1, video.currentTime / video.duration));
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      if (seek) {
        seek.value = String(Math.round(progress * 1000));
        seek.style.setProperty('--seek-progress', `${(progress * 100).toFixed(2)}%`);
        const label = `${timeLabel(video.currentTime)} of ${timeLabel(video.duration)}`;
        if (seek.getAttribute('aria-valuetext') !== label) seek.setAttribute('aria-valuetext', label);
      }
    }
  };
  seek?.addEventListener('input', () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(video.duration, Math.max(0, Number(seek.value) / 1000 * video.duration));
    drawBar();
  });
  const stopDraw = () => {
    if (!frame) return;
    if (videoFrame) video.cancelVideoFrameCallback(frame);
    else cancelAnimationFrame(frame);
    frame = 0;
  };
  const draw = () => {
    frame = 0;
    drawBar();
    if (video.paused || !onScreen || document.hidden) return;
    videoFrame = typeof video.requestVideoFrameCallback === 'function';
    frame = videoFrame ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
  };
  const pause = () => {
    clearRetry();
    stopDraw();
    attempt++;
    pending = false;
    if (!video.paused) {
      internalPause = true;
      video.pause();
    }
  };
  const scheduleRetry = () => {
    if (!eligible() || retryTimer || retries >= 3) return;
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      if (!eligible()) return;
      retries++;
      tryPlay();
      if (video.paused || video.readyState < 3) scheduleRetry();
    }, 1500);
  };
  const tryPlay = () => {
    if (!eligible() || pending) return;
    const currentAttempt = ++attempt;
    pending = true;
    Promise.resolve(video.play()).then(() => {
      if (currentAttempt !== attempt) return;
      pending = false;
      if (!eligible()) pause();
    }).catch(error => {
      if (currentAttempt !== attempt) return;
      pending = false;
      if (!eligible()) return;
      if (error.name === 'AbortError') scheduleRetry();
      else { blocked = true; clearRetry(); }
      // The native play control is a usable fallback; do not retry policy
      // rejections continuously or override a visitor's deliberate pause.
    });
  };
  const prepare = () => {
    if (prepared || !near || document.hidden) return;
    prepared = true;
    if (!reduced.matches) {
      video.preload = 'metadata';
      video.load();
    }
  };
  const update = () => {
    prepare();
    if (!onScreen || document.hidden || (reduced.matches && !motionOverride)) pause();
    else tryPlay();
  };

  new IntersectionObserver((entries, observer) => {
    near = entries[entries.length - 1].isIntersecting;
    prepare();
    if (prepared) observer.disconnect();
  }, { rootMargin: '200px 0px' }).observe(stage);
  new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    if (onScreen) near = true;
    update();
  }, { threshold: 0.15 }).observe(stage);
  document.addEventListener('visibilitychange', update);
  const motionChanged = () => { motionOverride = false; update(); };
  reduced.addEventListener ? reduced.addEventListener('change', motionChanged) : reduced.addListener(motionChanged);
  video.addEventListener('play', () => {
    // Native play is a deliberate opt-in even when motion is reduced. Calls
    // from our automatic scheduler already have a pending attempt.
    if (!pending) motionOverride = true;
    userPaused = false;
    blocked = false;
    prepared = true;
    if (!onScreen || document.hidden) pause();
  });
  video.addEventListener('playing', () => {
    retries = 0;
    clearRetry();
    if (!frame) draw();
  });
  video.addEventListener('pause', () => {
    clearRetry();
    stopDraw();
    if (internalPause) internalPause = false;
    else if (onScreen && !document.hidden) userPaused = true;
  });
  video.addEventListener('canplay', tryPlay);
  video.addEventListener('waiting', scheduleRetry);
  video.addEventListener('stalled', scheduleRetry);
  video.addEventListener('timeupdate', () => { retries = 0; clearRetry(); drawBar(); });
  video.addEventListener('seeked', drawBar);
  video.addEventListener('loadedmetadata', drawBar);
  video.addEventListener('durationchange', drawBar);
  video.addEventListener('error', () => { blocked = true; clearRetry(); stopDraw(); });
}
