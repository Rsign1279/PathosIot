// Composite the supplied helmet render over the cutout portrait. The mask
// stays small so pointer tracking works without a second WebGL scene.
const stage = document.querySelector('.founder-helmet-stage');

if (stage) {
  const canvas = stage.querySelector('canvas');
  const button = stage.querySelector('button');
  const context = canvas.getContext('2d');
  if (context) preparePortrait(stage, canvas, context, button);
}

function preparePortrait(stage, canvas, context, button) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const maxSparks = 150;
  const trailLife = 510;
  const motionLength = 820;
  const maskWidth = 144;
  const maskHeight = 180;
  const mask = document.createElement('canvas');
  mask.width = maskWidth;
  mask.height = maskHeight;
  const maskContext = mask.getContext('2d');
  const maskPixels = maskContext.createImageData(maskWidth, maskHeight);
  const thresholds = new Float32Array(maskWidth * maskHeight);
  const grain = new Float32Array(thresholds.length);
  const clamp = (number, low = 0, high = 1) => Math.max(low, Math.min(high, number));
  const smooth = number => number * number * (3 - 2 * number);
  const hash = (x, y) => ((Math.imul(x + 71, 374761393) ^ Math.imul(y + 19, 668265263)) >>> 0) % 1021 / 1020;

  function noise(x, y, cell) {
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const fx = smooth(x / cell - ix);
    const fy = smooth(y / cell - iy);
    const top = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
    const bottom = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  }

  let helmet, wireframe, silhouette;
  const seeds = [];
  let frame = 0;
  let visible = false;
  let worn = false;
  let progress = 0;
  let lastTime = 0;
  let pointer = null;
  let offsetX = 0;
  let offsetY = 0;
  let lastTrail = 0;
  let trail = [];
  let sparks = [];

  function image(name) {
    const source = new Image();
    source.src = new URL(`./assets/founder/${name}.webp`, import.meta.url);
    return source.decode().then(() => source);
  }

  function helmetPixel(x, y) {
    const column = clamp(Math.floor(x * maskWidth), 0, maskWidth - 1);
    const row = clamp(Math.floor(y * maskHeight), 0, maskHeight - 1);
    return row * maskWidth + column;
  }

  function burst(x, y, now, direction) {
    if (sparks.length >= maxSparks) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = .06 + Math.random() * .23;
    sparks.push({
      x, y, born: now, life: 320 + Math.random() * 460,
      vx: Math.cos(angle) * speed + direction * .10,
      vy: Math.sin(angle) * speed - .12,
      size: .8 + Math.random() * 1.7,
      pale: Math.random() < .24
    });
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2, 860 / Math.max(1, stage.clientHeight));
    const width = Math.round(stage.clientWidth * ratio);
    const height = Math.round(stage.clientHeight * ratio);
    if (!width || !height || (width === canvas.width && height === canvas.height)) return;
    canvas.width = width;
    canvas.height = height;
    wake();
  }

  function draw(now) {
    frame = 0;
    if (!visible || document.hidden || !helmet) return;
    const elapsed = lastTime ? Math.min(now - lastTime, 50) : 16;
    lastTime = now;
    const target = worn ? 1 : 0;
    const before = progress;
    progress = reduced.matches ? target : clamp(progress + Math.sign(target - progress) * Math.min(Math.abs(target - progress), elapsed / motionLength));
    const previousEdge = smooth(before) * 1.32 - .16;
    const edge = smooth(progress) * 1.32 - .16;
    const width = canvas.width;
    const height = canvas.height;
    const glide = 1 - Math.exp(-elapsed / 65);
    offsetX += ((pointer ? (pointer.x - .5) * width * .025 : 0) - offsetX) * glide;
    offsetY += ((pointer ? (pointer.y - .35) * height * .012 : 0) - offsetY) * glide;

    if (!reduced.matches && progress !== before) {
      const low = Math.min(edge, previousEdge);
      const high = Math.max(edge, previousEdge);
      for (const seed of seeds) {
        if (seed.threshold > low && seed.threshold <= high) burst(seed.x, seed.y, now, worn ? 1 : -1);
      }
    }

    trail = trail.filter(point => now - point.at < trailLife);
    const circles = trail.map(point => ({
      x: point.x * maskWidth,
      y: point.y * maskHeight,
      radius: 22 * (1 - (now - point.at) / trailLife)
    }));
    if (pointer) circles.push({ x: pointer.x * maskWidth, y: pointer.y * maskHeight, radius: 16 });

    context.clearRect(0, 0, width, height);
    if (progress > 0 || circles.length) {
      context.drawImage(helmet, offsetX, offsetY, width, height);
      if (progress < 1) {
        for (let y = 0; y < maskHeight; y++) {
          for (let x = 0; x < maskWidth; x++) {
            const index = y * maskWidth + x;
            let coverage = progress > 0 ? clamp((edge - thresholds[index]) * 48) : 0;
            if (coverage < 1) {
              for (const circle of circles) {
                const dx = x - circle.x;
                const dy = y - circle.y;
                const radius = Math.max(0, circle.radius + grain[index] * 19);
                coverage = Math.max(coverage, clamp((radius * radius - dx * dx - dy * dy) / 52));
                if (coverage === 1) break;
              }
            }
            maskPixels.data[index * 4 + 3] = coverage * 255;
          }
        }
        maskContext.putImageData(maskPixels, 0, 0);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(mask, 0, 0, width, height);
      }
    }

    if (progress < 1) {
      context.globalCompositeOperation = 'destination-over';
      context.globalAlpha = 1 - progress * .8;
      context.drawImage(wireframe, offsetX, offsetY, width, height);
    }
    context.globalCompositeOperation = 'source-over';
    const scale = width / 360;
    sparks = sparks.filter(spark => now - spark.born < spark.life);
    for (const spark of sparks) {
      const age = (now - spark.born) / 1000;
      const x = (spark.x + age * spark.vx) * width;
      const y = (spark.y + age * spark.vy + age * age * .16) * height;
      context.globalAlpha = Math.pow(1 - age * 1000 / spark.life, 1.4) * .93;
      context.fillStyle = spark.pale ? '#fbf0db' : '#e6b66d';
      context.beginPath();
      context.arc(x, y, spark.size * scale, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    const settling = !pointer && (Math.abs(offsetX) > .08 || Math.abs(offsetY) > .08);
    if (progress !== target || trail.length || sparks.length || settling) wake();
    else lastTime = 0;
  }

  function wake() {
    if (!frame && visible && !document.hidden && helmet) frame = requestAnimationFrame(draw);
  }

  function clearPointer() {
    pointer = null;
    wake();
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = lastTime = 0;
    offsetX = offsetY = 0;
    progress = worn ? 1 : 0;
    pointer = null;
    trail = [];
    sparks = [];
  }

  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
    else pause();
  });
  visibility.observe(stage);

  const prepare = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    prepare.disconnect();
    try {
      [helmet, wireframe] = await Promise.all([image('helmet'), image('wireframe')]);
      for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
          const index = y * maskWidth + x;
          const texture = .56 * noise(x, y, 12) + .30 * noise(x, y, 5) + .14 * noise(x, y, 2);
          grain[index] = texture - .5;
          thresholds[index] = .57 * x / maskWidth + .43 * y / maskHeight + grain[index] * .32;
        }
      }
      maskContext.drawImage(helmet, 0, 0, maskWidth, maskHeight);
      silhouette = maskContext.getImageData(0, 0, maskWidth, maskHeight).data;
      for (let y = 5; y < maskHeight; y += 5) {
        for (let x = 5; x < maskWidth; x += 5) {
          const index = y * maskWidth + x;
          if (silhouette[index * 4 + 3] > 190 && (x * 13 + y * 7) % 11 < 3) {
            seeds.push({ x: x / maskWidth, y: y / maskHeight, threshold: thresholds[index] });
          }
        }
      }
      resize();
      new ResizeObserver(resize).observe(stage);
      button.hidden = false;
      wake();
    } catch {
      // The portrait remains readable when a visual asset cannot load.
    }
  }, { rootMargin: '180px' });
  prepare.observe(stage);

  stage.addEventListener('pointermove', event => {
    if (!helmet || reduced.matches || worn || event.pointerType !== 'mouse' || event.buttons) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    pointer = { x, y };
    const now = performance.now();
    if (now - lastTrail > 42) {
      lastTrail = now;
      trail.push({ x, y, at: now });
      if (trail.length > 5) trail.shift();
      for (let i = 0; i < 6; i++) {
        const px = x + (Math.random() - .5) * .24;
        const py = y + (Math.random() - .5) * .20;
        if (silhouette[helmetPixel(px, py) * 4 + 3] > 160) burst(px, py, now, 1);
      }
    }
    wake();
  });
  stage.addEventListener('pointerleave', clearPointer);
  stage.addEventListener('pointercancel', clearPointer);
  button.addEventListener('click', () => {
    worn = !worn;
    button.querySelector('span').textContent = worn ? 'Show portrait' : 'Reveal helmet';
    pointer = null;
    trail = [];
    wake();
  });
  reduced.addEventListener('change', () => {
    pause();
    wake();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else wake();
  });
}
