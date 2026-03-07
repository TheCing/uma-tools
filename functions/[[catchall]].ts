/**
 * Cloudflare Pages Function: "Does Red Shift?"
 *
 * Handles does.redshift.work/[id] requests.
 * Shows whether the skill Red Shift is viable for a given CM preset.
 * All other hostnames pass through to the static site.
 */

const REDIRECT_HOST = 'does.redshift.work';

interface Response {
  answer: string;
  detail: string;
}

// CM preset ID → Red Shift viability
// TODO: Fill in actual answers
const RESPONSES: Record<number, Response> = {
  8:  { answer: 'Yes', detail: 'Sagittarius Cup — Nakayama 2500m Turf' },
  9:  { answer: 'Yes', detail: 'Capricorn Cup — Chukyo 1200m Turf' },
  10: { answer: 'Yes, but delayed', detail: 'Aquarius Cup — Tokyo 1600m Dirt' },
  11: { answer: 'No', detail: 'Pisces Cup — Hanshin 3200m Turf' },
  12: { answer: 'TBD', detail: 'Aries Cup — Nakayama 2000m Turf' },
  13: { answer: 'Yes', detail: 'Taurus Cup — Tokyo 2400m Turf' },
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
