/**
 * Cloudflare Pages Function: Dynamic OG tags for /events/
 *
 * When Discord (or other crawlers) fetch the events page, this function
 * intercepts the request and returns HTML with dynamic Open Graph meta tags
 * showing the next CM event info. Regular browser requests pass through
 * to the static SPA.
 */

// --- Inlined data (subset needed for OG generation) ---

interface Preset {
  id: number;
  name: string;
  date: string;
  courseId: number;
  season: number;
  ground: number;
  weather: number;
  time: number;
}

const PRESETS: Preset[] = [
  { id: 11, name: 'Pisces Cup', date: '2026-03-31', courseId: 10914, season: 1, ground: 4, weather: 3, time: 2 },
  { id: 10, name: 'Aquarius Cup', date: '2026-03-02', courseId: 10611, season: 4, ground: 1, weather: 1, time: 2 },
  { id: 9, name: 'Capricorn Cup', date: '2026-02-13', courseId: 10701, season: 4, ground: 3, weather: 4, time: 2 },
  { id: 8, name: 'Sagittarius Cup', date: '2026-01-22', courseId: 10506, season: 4, ground: 1, weather: 1, time: 2 },
  { id: 12, name: 'Aries Cup', date: '2026-04-15', courseId: 10504, season: 1, ground: 1, weather: 1, time: 2 },
  { id: 13, name: 'Taurus Cup', date: '2026-05-06', courseId: 10606, season: 1, ground: 1, weather: 1, time: 2 },
  { id: 14, name: 'Gemini Cup', date: '2026-05-20', courseId: 10602, season: 1, ground: 1, weather: 1, time: 2 },
  { id: 15, name: 'Cancer Cup', date: '2026-06-08', courseId: 10906, season: 2, ground: 2, weather: 2, time: 2 },
  { id: 16, name: 'Leo Cup', date: '2026-06-28', courseId: 10501, season: 2, ground: 1, weather: 1, time: 2 },
  { id: 17, name: 'Virgo Cup', date: '2026-07-20', courseId: 11103, season: 3, ground: 2, weather: 1, time: 2 },
];

const COURSE_DATA: Record<number, { raceTrackId: number; distance: number; surface: number }> = {
  10501: { raceTrackId: 10005, distance: 1200, surface: 1 },
  10504: { raceTrackId: 10005, distance: 2000, surface: 1 },
  10506: { raceTrackId: 10005, distance: 2500, surface: 1 },
  10602: { raceTrackId: 10006, distance: 1600, surface: 1 },
  10604: { raceTrackId: 10006, distance: 2000, surface: 1 },
  10606: { raceTrackId: 10006, distance: 2400, surface: 1 },
  10611: { raceTrackId: 10006, distance: 1600, surface: 2 },
  10701: { raceTrackId: 10007, distance: 1200, surface: 1 },
  10810: { raceTrackId: 10008, distance: 3000, surface: 1 },
  10811: { raceTrackId: 10008, distance: 3200, surface: 1 },
  10903: { raceTrackId: 10009, distance: 1600, surface: 1 },
  10906: { raceTrackId: 10009, distance: 2200, surface: 1 },
  10914: { raceTrackId: 10009, distance: 3200, surface: 1 },
  11103: { raceTrackId: 10101, distance: 2000, surface: 2 },
};

const TRACK_NAMES: Record<number, string> = {
  10001: 'Sapporo', 10002: 'Hakodate', 10003: 'Niigata', 10004: 'Fukushima',
  10005: 'Nakayama', 10006: 'Tokyo', 10007: 'Chukyo', 10008: 'Kyoto',
  10009: 'Hanshin', 10010: 'Kokura', 10101: 'Ooi',
};

// CM icon numbers: zodiac order starting from Capricorn = 1 (January)
const CM_ICON_NUMBER: Record<string, number> = {
  'Capricorn Cup': 1, 'Aquarius Cup': 2, 'Pisces Cup': 3, 'Aries Cup': 4,
  'Taurus Cup': 5, 'Gemini Cup': 6, 'Cancer Cup': 7, 'Leo Cup': 8,
  'Virgo Cup': 9, 'Libra Cup': 10, 'Scorpio Cup': 11, 'Sagittarius Cup': 12,
};

function getCmIconUrl(name: string): string | null {
  const num = CM_ICON_NUMBER[name];
  return num ? `https://media.gametora.com/umamusume/events/cm/icon_${num}.png` : null;
}

const GROUND_NAMES: Record<number, string> = { 1: 'Firm', 2: 'Good', 3: 'Soft', 4: 'Heavy' };
const WEATHER_NAMES: Record<number, string> = { 1: 'Sunny', 2: 'Cloudy', 3: 'Rainy', 4: 'Snowy' };
const SEASON_NAMES: Record<number, string> = { 1: 'Spring', 2: 'Summer', 3: 'Autumn', 4: 'Winter' };

// --- Logic ---

function getNextEvent(now: Date): Preset | null {
  const CM_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // ~7 days
  const upcoming = PRESETS
    .filter(p => {
      const start = new Date(p.date + 'T22:00:00Z');
      return start.getTime() + CM_DURATION_MS > now.getTime();
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return upcoming[0] || null;
}

function getApproxCountdown(now: Date, eventDate: Date): string {
  const diff = eventDate.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `~${days}d`;
  return `~${hours}h`;
}

function formatEventDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getCourseString(courseId: number): string {
  const course = COURSE_DATA[courseId];
  if (!course) return '';
  const track = TRACK_NAMES[course.raceTrackId] || 'Unknown';
  const surface = course.surface === 1 ? 'Turf' : 'Dirt';
  return `${track} ${course.distance}m ${surface}`;
}

function getConditionsString(preset: Preset): string {
  const parts = [
    GROUND_NAMES[preset.ground],
    WEATHER_NAMES[preset.weather],
    SEASON_NAMES[preset.season],
  ].filter(Boolean);
  return parts.join(' \u00b7 ');
}

function isBot(userAgent: string): boolean {
  const botPatterns = [
    'Discordbot',
    'Twitterbot',
    'facebookexternalhit',
    'LinkedInBot',
    'Slackbot',
    'TelegramBot',
    'WhatsApp',
  ];
  return botPatterns.some(bot => userAgent.includes(bot));
}

function getEventById(id: number): Preset | null {
  return PRESETS.find(p => p.id === id) || null;
}

function buildOgData(event: Preset, now: Date): { title: string; description: string; image: string | null } {
  const eventDate = new Date(event.date + 'T22:00:00Z');
  const courseStr = getCourseString(event.courseId);
  const conditions = getConditionsString(event);
  const dateStr = formatEventDate(eventDate);

  const isPast = eventDate.getTime() < now.getTime();
  const countdown = isPast ? '(ended)' : `in ${getApproxCountdown(now, eventDate)}`;

  return {
    title: `CM ${event.id}: ${event.name} ${countdown}`,
    description: `${event.name} \u2014 ${dateStr}\n${courseStr} \u00b7 ${conditions}`,
    image: getCmIconUrl(event.name),
  };
}

function buildHtml(title: string, description: string, canonicalUrl: string, image: string | null): string {
  const imageTags = image ? `
  <meta property="og:image" content="${escapeAttr(image)}">
  <meta name="twitter:image" content="${escapeAttr(image)}">` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${canonicalUrl}">${imageTags}
  <meta property="og:site_name" content="Moomoolator">
  <meta name="theme-color" content="#6ee718">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <title>${escapeHtml(title)}</title>
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
</head>
<body>
  <p>Redirecting to <a href="${canonicalUrl}">${canonicalUrl}</a></p>
</body>
</html>`;
}

// --- Handler ---

export const onRequest: PagesFunction = async (context) => {
  const userAgent = context.request.headers.get('User-Agent') || '';
  const url = new URL(context.request.url);
  const pathParts = url.pathname.replace(/^\/events\/?/, '').split('/').filter(Boolean);

  // For browsers hitting /events/:number, redirect to /events/
  if (!isBot(userAgent)) {
    if (pathParts.length > 0 && /^\d+$/.test(pathParts[0])) {
      return Response.redirect(new URL('/events/', url.origin).toString(), 302);
    }
    return context.next();
  }

  const now = new Date();

  // Check for /events/:id pattern
  const eventId = pathParts.length > 0 ? parseInt(pathParts[0], 10) : NaN;
  const specificEvent = !isNaN(eventId) ? getEventById(eventId) : null;

  let title: string;
  let description: string;
  let image: string | null = null;

  if (specificEvent) {
    ({ title, description, image } = buildOgData(specificEvent, now));
  } else {
    const nextEvent = getNextEvent(now);
    if (nextEvent) {
      ({ title, description, image } = buildOgData(nextEvent, now));
    } else {
      title = 'Events \u2014 Moomoolator';
      description = 'Upcoming Champions Meeting events and gacha banners for Uma Musume Pretty Derby';
    }
  }

  const canonicalUrl = specificEvent
    ? `https://umalator.app/events/${specificEvent.id}`
    : 'https://umalator.app/events/';

  const html = buildHtml(title, description, canonicalUrl, image);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
