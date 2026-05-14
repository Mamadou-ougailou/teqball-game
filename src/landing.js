/* ── CUSTOM CURSOR ── */
const cursor = document.getElementById('cursor');
const ring = document.getElementById('cursor-ring');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = mx + 'px';
  cursor.style.top = my + 'px';
});

(function animRing() {
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  ring.style.left = rx + 'px';
  ring.style.top = ry + 'px';
  requestAnimationFrame(animRing);
})();

document.querySelectorAll('button, .video-slot').forEach(el => {
  el.addEventListener('mouseenter', () => cursor.classList.add('hovered'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('hovered'));
});

/* ── CANVAS PLACEHOLDER RENDERER ── */
function PlaceholderVideo(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let t = 0;
  const particles = Array.from({length: config.particleCount || 40}, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0006,
    vy: -Math.random() * 0.0008 - 0.0002,
    r: Math.random() * 1.5 + 0.4,
    alpha: Math.random()
  }));

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, config.bgTop || '#060608');
    bg.addColorStop(1, config.bgBot || '#0a0a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(200,168,75,0.04)';
    ctx.lineWidth = 1;
    const gSize = 40;
    for (let x = 0; x < W; x += gSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const ox = W * (0.5 + Math.sin(t * 0.4) * 0.15);
    const oy = H * (0.5 + Math.cos(t * 0.3) * 0.1);
    const orb = ctx.createRadialGradient(ox, oy, 0, ox, oy, W * 0.35);
    orb.addColorStop(0, config.orbColor || 'rgba(200,168,75,0.18)');
    orb.addColorStop(1, 'transparent');
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, H);

    drawTable(ctx, W, H, t);

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      p.alpha = Math.abs(Math.sin(t * 0.5 + p.x * 10));
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,168,75,${p.alpha * 0.5})`;
      ctx.fill();
    });

    drawBall(ctx, W, H, t, config.ballColor || '#c8a84b');

    const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.font = `700 ${W * 0.035}px 'Barlow Condensed', sans-serif`;
    ctx.fillStyle = 'rgba(200,168,75,0.15)';
    ctx.fillText(config.label || 'PREVIEW', W * 0.06, H * 0.88);

    t += 0.016;
    requestAnimationFrame(draw);
  }
  draw();
}

function drawTable(ctx, W, H, t) {
  const cx = W * 0.5, cy = H * 0.55;
  const tw = W * 0.7, th = H * 0.06;
  ctx.save();
  ctx.translate(cx, cy);

  const tg = ctx.createLinearGradient(-tw/2, -th/2, tw/2, th/2);
  tg.addColorStop(0, 'rgba(30,28,24,0.9)');
  tg.addColorStop(0.5, 'rgba(50,44,32,0.9)');
  tg.addColorStop(1, 'rgba(30,28,24,0.9)');

  ctx.beginPath();
  ctx.moveTo(-tw/2, 0);
  ctx.bezierCurveTo(-tw/4, -th*2.5, tw/4, -th*2.5, tw/2, 0);
  ctx.lineTo(tw/2, th*0.5);
  ctx.bezierCurveTo(tw/4, th*1.5, -tw/4, th*1.5, -tw/2, th*0.5);
  ctx.closePath();
  ctx.fillStyle = tg;
  ctx.fill();

  ctx.strokeStyle = 'rgba(200,168,75,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-tw/2, 0);
  ctx.bezierCurveTo(-tw/4, -th*2.5, tw/4, -th*2.5, tw/2, 0);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(200,168,75,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -th*2.8);
  ctx.lineTo(0, th*0.3);
  ctx.stroke();

  ctx.restore();
}

function drawBall(ctx, W, H, t, color) {
  const progress = (t * 0.4) % 1;
  const bx = W * (0.2 + progress * 0.6);
  const peak = H * 0.25;
  const ground = H * 0.52;
  const by = ground - Math.sin(progress * Math.PI) * (ground - peak);
  const r = 8 + Math.sin(t * 2) * 1;

  const glow = ctx.createRadialGradient(bx, by, 0, bx, by, r * 3);
  glow.addColorStop(0, color.replace(')', ',0.3)').replace('rgb', 'rgba'));
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(bx, by, r * 3, 0, Math.PI * 2);
  ctx.fill();

  const ball = ctx.createRadialGradient(bx - r*0.3, by - r*0.3, 0, bx, by, r);
  ball.addColorStop(0, '#fff8e7');
  ball.addColorStop(0.4, color);
  ball.addColorStop(1, '#3a2e10');
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = ball;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(bx, ground + 6, r * 1.5, r * 0.35, 0, 0, Math.PI*2);
  ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - Math.sin(progress*Math.PI) * 0.7)})`;
  ctx.fill();
}

/* ── INIT CANVAS PLACEHOLDERS ── */
PlaceholderVideo('canvas-arena', {
  label: 'ARÈNES — CLOUD / RAVE / SPACE',
  bgTop: '#06070a',
  bgBot: '#0a0810',
  orbColor: 'rgba(80,120,200,0.12)',
  ballColor: '#6ab0ff',
  particleCount: 55
});

PlaceholderVideo('canvas-char', {
  label: 'PERSONNAGES & SUPERPOWERS',
  bgTop: '#090608',
  bgBot: '#0d090a',
  orbColor: 'rgba(224,92,42,0.12)',
  ballColor: '#e05c2a',
  particleCount: 35
});

/* ── AMBIENT DRONE (Web Audio API) ── */
function createAmbientDrone() {
   const audio = new Audio('/audio/intro.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    audio.play().catch(() => {}); // catch nécessaire (politique navigateur)

    return {
      fadeOut(duration = 1.5) {
        const start = audio.volume;
        const steps = 30;
        const interval = (duration * 1000) / steps;
        let i = 0;
        const fade = setInterval(() => {
          i++;
          audio.volume = Math.max(0, start * (1 - i / steps));
          if (i >= steps) { clearInterval(fade); audio.pause(); }
        }, interval);
      }
    };
}

/* ── NARRATION CARDS ── */
const NARRATION_CARDS = [
  { text: 'Dans un monde où les lois de la physique sont brisées…', speed: 45, pause: 1800 },
  { text: 'Deux légendes s’affrontent sur une table courbée.', speed: 50, pause: 1800 },
  { text: 'Chaque frappe est une œuvre d’art.', speed: 60, pause: 1600 },
  { text: 'Chaque point, une victoire sur l’impossible.', speed: 55, pause: 1700 },
  { text: 'L’arène vous attend.', speed: 70, pause: 1200 },
  { text: 'TEQBALL', subtext: 'ÉDITION SURRÉALISTE', speed: 85, pause: 2500, isTitle: true },
];

const _wait = ms => new Promise(r => setTimeout(r, ms));

/* ── INTRO NARRATION ── */
async function showIntroNarration(onOpaque) {
  return new Promise(resolve => {
    const screen   = document.getElementById('intro-screen');
    const cardEl   = document.getElementById('intro-card');
    const lineEl   = document.getElementById('intro-line');
    const subEl    = document.getElementById('intro-subline');

    let done = false;
    let drone = null;

    try { drone = createAmbientDrone(); } catch (_) {}

    const finish = () => {
      if (done) return;
      done = true;
      if (drone) drone.fadeOut(1.2);
      screen.style.opacity = '0';
      setTimeout(() => { screen.style.display = 'none'; resolve(); }, 850);
    };

    // Reveal screen
    screen.style.opacity = '0';
    screen.style.transition = 'opacity 0.85s ease';
    screen.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => { screen.style.opacity = '1'; }));

    (async () => {
      await _wait(850);
      if (onOpaque) onOpaque();

      for (const card of NARRATION_CARDS) {
        if (done) break;

        // Reset card
        cardEl.className = 'intro-card' + (card.isTitle ? ' title-card' : '');
        lineEl.textContent = '';
        lineEl.classList.remove('done');
        subEl.textContent = '';
        cardEl.style.opacity = '0';

        await _wait(120);
        if (done) break;
        cardEl.style.opacity = '1';
        await _wait(180);

        // Type main text
        for (const char of card.text) {
          if (done) break;
          lineEl.textContent += char;
          await _wait(card.speed);
        }
        lineEl.classList.add('done');

        // Type subtext (title card only)
        if (card.subtext && !done) {
          await _wait(340);
          for (const char of card.subtext) {
            if (done) break;
            subEl.textContent += char;
            await _wait(Math.round(card.speed * 0.6));
          }
        }

        if (!done) await _wait(card.pause);

        if (!done) {
          cardEl.style.opacity = '0';
          await _wait(560);
        }
      }

      if (!done) finish();
    })();
  });
}

/* ── PRE-MATCH COUNTDOWN ── */
async function showPreMatchCountdown() {
  return new Promise(resolve => {
    const overlay = document.getElementById('prematch-overlay');
    const textEl  = document.getElementById('prematch-text');

    overlay.classList.add('active');

    const steps = [
      { text: 'ROUND 1', cls: 'round', ms: 1400 },
      { text: 'PRÊT ?', cls: 'ready', ms: 950 },
      { text: '3', cls: 'count', ms: 780 },
      { text: '2', cls: 'count', ms: 780 },
      { text: '1', cls: 'count', ms: 780 },
      { text: 'JOUEZ !', cls: 'go', ms: 950 },
    ];

    (async () => {
      for (const step of steps) {
        textEl.className = 'prematch-text ' + step.cls;
        textEl.textContent = step.text;
        // Restart animation by forcing reflow
        textEl.style.animation = 'none';
        textEl.offsetHeight;
        textEl.style.animation = '';
        await _wait(step.ms);
      }
      textEl.style.transition = 'opacity 0.35s ease';
      textEl.style.opacity = '0';
      await _wait(380);
      overlay.classList.remove('active');
      textEl.style.opacity = '';
      textEl.style.transition = '';
      resolve();
    })();
  });
}

/* ── TRANSITION ── */
const transitionEl = document.getElementById('transition');
const gameScreen = document.getElementById('game-screen');
const loadingScreen = document.getElementById('loading-screen');
const app = document.getElementById('app');
const backBtn = document.getElementById('back-btn');
let gameStarted = false;
let mainLoadPromise = null;
let preloadPromise = null;   // resolves when full scene is ready
let gameStarting = false;

/* ── PREFETCH GAME ASSETS ── */
function prefetchGameAssets() {
  // Import + compile the TS bundle
  mainLoadPromise = import('/src/main.ts');

  // Add `preloading` so #game-screen is display:block (canvas gets real dimensions)
  // but opacity:0/z-index:-1 so the user never sees it during the intro.
  gameScreen.classList.add('preloading');

  // Kick off the full scene preload (Havok init, GLB loading, physics setup…)
  // while the intro narration plays.  By the time the user clicks Play it's done.
  preloadPromise = mainLoadPromise
    .then(mod => mod.preloadGame())
    .catch(err => {
      console.warn('[preload] background preload failed, will retry on Play:', err);
      preloadPromise = null;
    });
}

function showTransition(label, callback) {
  document.getElementById('transition-text').textContent = label;
  transitionEl.classList.add('active');
  setTimeout(callback, 700);
}

function hideTransition() {
  transitionEl.classList.remove('active');
}

/* ── NAVIGATION ── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.blur();
    const action = btn.dataset.action;
    if (action === 'play') {
      if (gameStarting) return;
      gameStarting = true;

      // If prefetchGameAssets() was never called (e.g. user skipped intro), start now
      if (!mainLoadPromise) prefetchGameAssets();

      app.style.display = 'none';
      backBtn.style.display = 'block';
      document.body.style.cursor = 'default';

      try {
        const mod = await mainLoadPromise;

        if (!preloadPromise) {
          // Preload didn't start yet — show loading screen while it runs
          loadingScreen.classList.add('active');
          preloadPromise = mod.preloadGame();
        }

        // If preload is still in progress, show a lightweight loading indicator
        const isReady = await Promise.race([
          preloadPromise.then(() => true),
          Promise.resolve(false),
        ]);
        if (!isReady) {
          loadingScreen.classList.add('active');
          await preloadPromise;
        }

        // Scene is fully loaded — switch from invisible preloading to active
        gameScreen.classList.remove('preloading');
        gameScreen.classList.add('active');
        mod.startGame();
        gameStarted = true;
        loadingScreen.classList.remove('active');
      } catch (err) {
        gameScreen.classList.remove('preloading');
        gameScreen.classList.add('active');
        loadingScreen.classList.add('active');
        loadingScreen.querySelector('p').textContent = 'Erreur : ' + (err.message || err);
        loadingScreen.querySelector('p').style.color = '#ff6b6b';
        console.error(err);
      }

      await showPreMatchCountdown();
    } else if (action === 'characters') {
      document.getElementById('character-select-screen').classList.add('active');
    } else {
      showTransition(btn.textContent.trim().split('\n').pop().trim().toUpperCase(), () => {
        setTimeout(() => {
          hideTransition();
        }, 300);
      });
    }
  });
});

/* ── EXPERIENCE INITIALIZATION ── */
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('btn-start-experience');

if (startBtn) {
  startBtn.addEventListener('click', async () => {
    // 1. Hide start screen
    startScreen.style.opacity = '0';
    setTimeout(() => startScreen.style.display = 'none', 1000);

    // 2. Start prefetching assets in background during narration
    prefetchGameAssets();

    // 3. Play narration
    await showIntroNarration();

    // 4. Show menu
    app.style.display = 'grid';
    app.style.opacity = '0';
    app.style.transition = 'opacity 1s ease';
    
    // Force a resize event so the canvases calculate their new dimensions
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    
    requestAnimationFrame(() => {
      app.style.opacity = '1';
    });
  });
}

/* ── BACK TO MENU ── */
backBtn.addEventListener('click', () => {
  showTransition('MENU', () => {
    gameScreen.classList.remove('active');
    backBtn.style.display = 'none';
    app.style.display = 'grid';
    document.body.style.cursor = 'none';
    setTimeout(hideTransition, 200);
  });
});

/* ── CHARACTER SELECT ── */
const charactersData = [
  {
    id: 'neymar',
    name: 'Neymar Jr',
    subtitle: 'Agile, high spin',
    power: 'BALL-FREEZE',
    stats: { speed: 95, jump: 40, power: 100, spin: 98 }
  },
  {
    id: 'flamingo',
    name: 'Flamingo Fury',
    subtitle: 'Lower power, higher finesse',
    power: 'SPEED-BURST',
    stats: { speed: 85, jump: 30, power: 100, spin: 95 }
  },
  {
    id: 'human_athlete',
    name: 'Human Athlete',
    subtitle: 'Balanced allrounder',
    power: 'MEGA-BOUNCE',
    stats: { speed: 80, jump: 20, power: 120, spin: 80 }
  }
];

let selectedCharId = 'neymar';

function initCharacterSelect() {
  const grid = document.getElementById('cs-grid');
  if(!grid) return;
  grid.innerHTML = '';
  
  charactersData.forEach(char => {
    const card = document.createElement('div');
    card.className = `cs-card ${char.id === selectedCharId ? 'selected' : ''}`;
    card.innerHTML = `
      <h4>${char.name}</h4>
      <p>${char.subtitle}</p>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.cs-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedCharId = char.id;
      window.selectedCharacterId = char.id; // Expose globally for main.ts
      updateCharacterStats(char);
    });
    grid.appendChild(card);
  });
  
  // Init first selection
  updateCharacterStats(charactersData.find(c => c.id === selectedCharId));
}

function updateCharacterStats(char) {
  document.getElementById('cs-char-name').textContent = char.name;
  document.getElementById('cs-char-subtitle').textContent = char.subtitle;
  document.getElementById('cs-power-name').textContent = char.power;
  
  // Reset width to 0 briefly to trigger CSS transition
  ['speed', 'jump', 'power', 'spin'].forEach(stat => {
    document.getElementById(`stat-${stat}`).style.width = '0%';
  });
  
  setTimeout(() => {
    document.getElementById('stat-speed').style.width = char.stats.speed + '%';
    document.getElementById('stat-jump').style.width = char.stats.jump + '%';
    document.getElementById('stat-power').style.width = (char.stats.power/1.5) + '%';
    document.getElementById('stat-spin').style.width = char.stats.spin + '%';
  }, 50);
}

document.getElementById('cs-back-btn')?.addEventListener('click', () => {
  document.getElementById('character-select-screen').classList.remove('active');
});

initCharacterSelect();
