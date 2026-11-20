const section = document.getElementById('founder-portrait');

if (section) setUpPortrait(section);

function setUpPortrait(section) {
  const art = section.querySelector('.founder-scene-art');
  const canvas = art.querySelector('canvas');
  const still = art.querySelector('.founder-helmet-still');
  const controls = section.querySelector('.founder-scene-controls');
  const scrub = controls.querySelector('input');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const trailDuration = 260;
  const maxTrailPoints = 24;
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

  let renderer;
  let loading = false;
  let contextLost = false;
  let visible = false;
  let dragging = null;
  let pointer = null;
  let trail = [];
  let desired = 0;
  let yaw = 0;
  let pitch = 0;
  let frame = 0;
  let previousTime = 0;
  let artRect;

  function requestDraw() {
    if (renderer && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
  }

  function draw(time) {
    frame = 0;
    if (!visible || document.hidden || !renderer) return;
    const elapsed = previousTime ? time - previousTime : 17;
    previousTime = time;
    const aimYaw = pointer && !reduced.matches ? clamp((.5 - pointer.x) * .49, -.15, .15) : 0;
    const aimPitch = pointer && !reduced.matches ? clamp((pointer.y - .31) * .33, -.09, .09) : 0;

    // The pose and wipe follow the newest input on the next frame. Only
    // releasing the pointer eases, so reversing direction has no catch-up.
    const returnEase = 1 - Math.exp(-Math.min(50, elapsed) / 42);
    yaw = pointer || Math.abs(yaw) < .001 ? aimYaw : yaw * (1 - returnEase);
    pitch = pointer || Math.abs(pitch) < .001 ? aimPitch : pitch * (1 - returnEase);
    while (trail.length && time - trail[0].time >= trailDuration) trail.shift();
    renderer.draw(desired, yaw, pitch, trail, time, trailDuration);

    if (yaw !== aimYaw || pitch !== aimPitch || trail.length) requestDraw();
    else previousTime = 0;
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = previousTime = 0;
    pointer = null;
    trail = [];
    yaw = pitch = 0;
    endDrag();
  }

  function setReveal(value) {
    desired = clamp(value);
    const percent = String(Math.round(desired * 100));
    const label = desired === 0 ? 'Portrait' : desired === 1 ? 'Helmet' : `${percent}% helmet`;
    if (scrub.value !== percent) scrub.value = percent;
    if (scrub.getAttribute('aria-valuetext') !== label) scrub.setAttribute('aria-valuetext', label);
    if (art.dataset.renderer === 'still') {
      const edge = desired === 0 ? 100 : desired === 1 ? 0 : 84 - desired * 69;
      art.style.setProperty('--helmet-clip', `${edge}%`);
    }
    requestDraw();
  }

  function resize() {
    artRect = null;
    if (!renderer || !art.clientWidth || !art.clientHeight) return;
    renderer.resize(art.clientWidth, art.clientHeight);
    requestDraw();
  }

  function showControls(mode) {
    art.dataset.renderer = mode;
    art.dataset.interactive = '';
    controls.hidden = false;
    setReveal(desired);
  }

  async function fallback() {
    renderer?.dispose();
    renderer = null;
    canvas.hidden = true;
    still.src = new URL('./assets/founder/helmet.webp', import.meta.url);
    try {
      await still.decode();
      showControls('still');
    } catch {
      // The cutout portrait is available independently of the helmet.
      controls.hidden = true;
      delete art.dataset.interactive;
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const { createHelmetRenderer } = await import('./founder-helmet-renderer.js');
      renderer = await createHelmetRenderer(canvas);
      if (contextLost) {
        await fallback();
        return;
      }
      resize();
      canvas.hidden = false;
      showControls('live');
      new ResizeObserver(resize).observe(art);
    } catch {
      await fallback();
    }
  }

  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      load();
      requestDraw();
    } else stop();
  });
  visibility.observe(section);

  function endDrag(event) {
    if (!dragging || (event && event.pointerId !== dragging.id)) return;
    const id = dragging.id;
    dragging = null;
    delete art.dataset.dragging;
    if (art.hasPointerCapture(id)) art.releasePointerCapture(id);
    if (event?.pointerType === 'touch') {
      pointer = null;
      requestDraw();
    }
  }

  art.addEventListener('pointerdown', event => {
    if (!art.hasAttribute('data-interactive') || !event.isPrimary || event.button !== 0) return;
    dragging = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      initial: desired,
      active: false,
      rect: artRect = art.getBoundingClientRect()
    };
  });
  art.addEventListener('pointermove', event => {
    if (!art.hasAttribute('data-interactive') || !event.isPrimary) return;
    const drag = dragging?.id === event.pointerId ? dragging : null;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const threshold = event.pointerType === 'touch' ? 8 : 2;
      if (!drag.active && Math.hypot(dx, dy) > threshold) {
        if (event.pointerType === 'touch' && Math.abs(dy) >= Math.abs(dx)) {
          endDrag(event);
          return;
        }
        drag.active = true;
        art.dataset.dragging = '';
        art.setPointerCapture(event.pointerId);
      }
      if (drag.active) setReveal(drag.initial + dx / (drag.rect.width * .31));
    }
    if (!renderer || reduced.matches || (!drag?.active && event.pointerType !== 'mouse')) return;
    const rect = artRect ??= art.getBoundingClientRect();
    if (!pointer) trail = [];
    const now = performance.now();

    function record(sample) {
      pointer = {
        x: clamp((sample.clientX - rect.left) / rect.width),
        y: clamp((sample.clientY - rect.top) / rect.height)
      };
      const last = trail.at(-1);
      if (last && Math.hypot(pointer.x - last.x, pointer.y - last.y) < .006) return;
      trail.push({ ...pointer, time: now });
      if (trail.length > maxTrailPoints) trail.shift();
    }

    for (const sample of (event.getCoalescedEvents?.() ?? []).slice(-maxTrailPoints)) record(sample);
    record(event);
    requestDraw();
  });
  art.addEventListener('pointerup', endDrag);
  art.addEventListener('pointercancel', endDrag);
  art.addEventListener('lostpointercapture', endDrag);
  art.addEventListener('pointerleave', event => {
    if (!dragging?.active) endDrag(event);
    pointer = null;
    requestDraw();
  });
  art.addEventListener('dragstart', event => event.preventDefault());
  const clearArtRect = () => { artRect = null; };
  addEventListener('scroll', clearArtRect, { passive: true });
  addEventListener('resize', clearArtRect, { passive: true });

  scrub.addEventListener('input', () => {
    pointer = null;
    trail = [];
    setReveal(Number(scrub.value) / 100);
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    stop();
    if (renderer) fallback();
  });
  reduced.addEventListener('change', () => {
    stop();
    requestDraw();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else requestDraw();
  });
}
