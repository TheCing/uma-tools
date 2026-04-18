/**
 * Cloudflare Pages Function: "Does Red Shift?"
 *
 * Handles does.redshift.work/[id] requests.
 * Shows whether the skill Red Shift is viable for a given CM preset.
 * All other hostnames pass through to the static site.
 *
 * April Fools 2026: Maruzensky takeover
 */

const REDIRECT_HOST = 'does.redshift.work';
const ASSETS_HOST = 'https://umalator.app';

// April Fools: check if it's April 1st in any timezone that's currently April 1st
// (generous window: UTC Mar 31 12:00 through UTC Apr 2 12:00 to cover all timezones)
function isAprilFools(): boolean {
  const now = new Date();
  const month = now.getUTCMonth(); // 0-indexed, so March=2, April=3
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  return (month === 2 && day === 31 && hour >= 12) ||
         (month === 3 && day === 1) ||
         (month === 3 && day === 2 && hour < 12);
}

function buildAprilFools(): string {
  const base = ASSETS_HOST + '/icons/april-fools';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Maruzensky?</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      background: #1a0a2e;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .center-wrap {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 10;
    }
    .center-wrap img {
      max-width: min(80vw, 500px);
      max-height: 60vh;
      border-radius: 12px;
      box-shadow: 0 0 60px rgba(255, 0, 128, 0.6), 0 0 120px rgba(128, 0, 255, 0.4);
    }
    .title {
      font-size: clamp(2rem, 8vw, 5rem);
      font-weight: 900;
      background: linear-gradient(135deg, #ff0080, #ff8c00, #ff0080);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-shift 2s ease infinite;
      margin-top: 1rem;
      text-shadow: none;
    }
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .bouncer {
      position: absolute;
      width: 150px;
      z-index: 5;
    }
    .bouncer img {
      width: 100%;
      border-radius: 8px;
    }
    .sparkle {
      position: absolute;
      width: 6px;
      height: 6px;
      background: #fff;
      border-radius: 50%;
      pointer-events: none;
      animation: sparkle-fade 1.5s ease-out forwards;
    }
    @keyframes sparkle-fade {
      0% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(0); }
    }
  </style>
</head>
<body>
  <div class="center-wrap">
    <img src="${base}/maruzensky.gif" alt="Maruzensky" />
    <p class="title">ABSOLUTE SUPERCAR</p>
  </div>

  <div class="bouncer" id="b1"><img src="${base}/maru_fan.gif" alt="" /></div>
  <div class="bouncer" id="b2"><img src="${base}/maru_fan_dance.gif" alt="" /></div>
  <div class="bouncer" id="b3"><img src="${base}/uma-musume-maruzensky.gif" alt="" /></div>

  <script>
    // DVD bouncing logic
    function makeBouncer(el, speedX, speedY) {
      let x = Math.random() * (window.innerWidth - 150);
      let y = Math.random() * (window.innerHeight - 150);
      let vx = speedX;
      let vy = speedY;
      const w = 150;
      const h = 150;

      function step() {
        x += vx;
        y += vy;

        if (x <= 0 || x + w >= window.innerWidth) {
          vx = -vx;
          x = Math.max(0, Math.min(x, window.innerWidth - w));
        }
        if (y <= 0 || y + h >= window.innerHeight) {
          vy = -vy;
          y = Math.max(0, Math.min(y, window.innerHeight - h));
        }

        el.style.left = x + 'px';
        el.style.top = y + 'px';
        requestAnimationFrame(step);
      }
      step();
    }

    makeBouncer(document.getElementById('b1'), 2.5, 1.8);
    makeBouncer(document.getElementById('b2'), -2.0, 2.3);
    makeBouncer(document.getElementById('b3'), 1.7, -2.6);

    // Random sparkles
    setInterval(() => {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = Math.random() * window.innerWidth + 'px';
      s.style.top = Math.random() * window.innerHeight + 'px';
      s.style.width = s.style.height = (3 + Math.random() * 6) + 'px';
      s.style.background = ['#ff0080','#ff8c00','#8000ff','#00ffff','#fff'][Math.floor(Math.random()*5)];
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1500);
    }, 100);
  </script>
</body>
</html>`;
}

interface CmResponse {
  answer: string;
  detail: string;
}

// CM preset ID → Red Shift viability
const RESPONSES: Record<number, CmResponse> = {
  1:  { answer: 'Yes', detail: 'Taurus Cup — Tokyo 2400m Turf' },
  2:  { answer: 'Glue', detail: 'Gemini Cup — Kyoto 3200m Turf' },
  3:  { answer: 'Yes, but delayed', detail: 'Cancer Cup — Tokyo 1600m Turf' },
  4:  { answer: 'Yes', detail: 'Leo Cup — Hanshin 2200m Turf' },
  5:  { answer: 'Yes, but delayed', detail: 'Virgo Cup — Hanshin 1600m Turf' },
  6:  { answer: 'Glue', detail: 'Libra Cup — Kyoto 3000m Turf' },
  7:  { answer: 'Yes', detail: 'Scorpio Cup — Tokyo 2000m Turf' },
  8:  { answer: 'Yes', detail: 'Sagittarius Cup — Nakayama 2500m Turf' },
  9:  { answer: 'Yes', detail: 'Capricorn Cup — Chukyo 1200m Turf' },
  10: { answer: 'Yes, but delayed', detail: 'Aquarius Cup — Tokyo 1600m Dirt' },
  11: { answer: 'Glue', detail: 'Pisces Cup — Hanshin 3200m Turf' },
  12: { answer: 'Glue', detail: 'Aries Cup — Nakayama 2000m Turf' },
  13: { answer: 'Mandatory 😠', detail: 'Taurus Cup — Tokyo 2400m Turf' },
  14: { answer: 'TBD', detail: 'Gemini Cup — Tokyo 1600m Turf' },
  15: { answer: 'TBD', detail: 'Cancer Cup — Hanshin 2200m Turf' },
  16: { answer: 'TBD', detail: 'Leo Cup — Nakayama 1200m Turf' },
  17: { answer: 'TBD', detail: 'Virgo Cup — Ooi 2000m Dirt' },
};

function buildPage(answer: string, detail: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Red Shift?</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .answer {
      font-size: clamp(4rem, 15vw, 10rem);
      font-weight: 700;
      line-height: 1;
      margin: 0;
    }
    .detail {
      font-size: clamp(0.9rem, 2.5vw, 1.2rem);
      color: #888;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <p class="answer">${escapeHtml(answer)}</p>
  <p class="detail">${escapeHtml(detail)}</p>
</body>
</html>`;
}

function build404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Red Shift?</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .answer {
      font-size: clamp(2rem, 8vw, 4rem);
      font-weight: 700;
      color: #ccc;
    }
  </style>
</head>
<body>
  <p class="answer">Unknown CM</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  if (url.hostname !== REDIRECT_HOST) {
    return context.next();
  }

  // April Fools takeover — every route gets Maruzensky'd
  if (isAprilFools()) {
    return new Response(buildAprilFools(), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, '');

  if (!path) {
    return context.next();
  }

  const id = parseInt(path, 10);

  if (isNaN(id)) {
    return new Response(build404(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  const entry = RESPONSES[id];

  if (!entry) {
    return new Response(build404(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  return new Response(buildPage(entry.answer, entry.detail), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
