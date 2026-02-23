/**
 * Events Page
 *
 * Countdown timer to the next Champion's Meeting event,
 * localized to user's timezone.
 */

import { h, render, Fragment } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import {
  Calendar,
  Sun,
  Moon,
  Menu,
  Calculator,
  Zap,
  Book,
  Clock,
  MapPin,
  ExternalLink,
} from 'lucide-react';

import { presets, EventType, type Preset } from '../umalator-global/v2/presets';
import {
  GroundCondition,
  Weather,
  Season,
  Time,
} from '../uma-skill-tools/RaceParameters';
import courseData from '../umalator-global/course_data.json';
import tracknames from '../umalator-global/tracknames.json';

import './events.css';

// Storage keys
const PREFS_KEY = 'events-prefs';
const BANNERS_CACHE_KEY = 'events-banners-cache';
const BANNERS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Upcoming banners (manually maintained until they appear on GameTora)
interface UpcomingBanner {
  startDate: string;
  endDate: string;
  characters: string[];
  supports: string[];
}

const UPCOMING_BANNERS: UpcomingBanner[] = [
  {
    // Valentine's banner (currently active)
    startDate: '2026-02-18T22:00:00Z',
    endDate: '2026-03-01T21:59:00Z',
    characters: ['[CODE: ICING] Mihono Bourbon', '[Precise Chocolatier] Eishin Flash'],
    supports: ['[Little Cupcakes, Big Emotions] Nishino Flower', '[Super! Sonic! Flower Power!] Sakura Bakushin O'],
  },
  {
    // Mejiro Ardan banner
    startDate: '2026-02-25T22:00:00Z',
    endDate: '2026-03-05T21:59:00Z',
    characters: ['Mejiro Ardan'],
    supports: ['Agnes Digital (Power SSR)', 'Ines Fujin (Wit SR)'],
  },
  {
    // Trackblazer scenario launch - Admire Vega
    startDate: '2026-03-04T22:00:00Z',
    endDate: '2026-03-14T21:59:00Z',
    characters: ['Admire Vega'],
    supports: ['Fine Motion (Wit SSR)', 'Kawakami Princess (Speed SSR)'],
  },
  {
    // Trackblazer scenario - Kitasan Black & Matikanetannhauser
    startDate: '2026-03-04T22:00:00Z',
    endDate: '2026-03-14T21:59:00Z',
    characters: ['Kitasan Black', 'Matikanetannhauser'],
    supports: ['Narita Top Road (Speed SSR)', 'Admire Vega (Guts SR)'],
  },
  {
    // Satono Diamond
    startDate: '2026-03-18T22:00:00Z',
    endDate: '2026-03-28T21:59:00Z',
    characters: ['Satono Diamond'],
    supports: ['Marvelous Sunday (Guts SSR)', 'Curren Chan (Speed SR)'],
  },
  {
    // Mejiro Bright
    startDate: '2026-03-25T22:00:00Z',
    endDate: '2026-04-04T21:59:00Z',
    characters: ['Mejiro Bright'],
    supports: ['Zenno Rob Roy (Speed SSR)', 'Curren Chan (Wit SSR)'],
  },
];

interface Preferences {
  darkMode: boolean;
}

const DEFAULT_PREFS: Preferences = {
  darkMode: true,
};

// Banner types
interface CharCard {
  id: number;
  charaId: number;
  name: string;
  rarity: number;
}

interface SupportCard {
  id: number;
  charaId: number;
  name: string;
  rarity: number;
  type: number; // 1=speed, 2=stamina, etc.
}

interface Banner {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  pickupIds: number[];
}

interface BannerData {
  characters: Banner[];
  supports: Banner[];
  charLookup: Record<number, CharCard>;
  supportLookup: Record<number, SupportCard>;
  fetchedAt: number;
}

// Support card type icons
const SUPPORT_TYPE_ICONS: Record<number, string> = {
  1: '/uma-tools/icons/status_00.png', // Speed
  2: '/uma-tools/icons/status_01.png', // Stamina
  3: '/uma-tools/icons/status_02.png', // Power
  4: '/uma-tools/icons/status_03.png', // Guts
  5: '/uma-tools/icons/status_04.png', // Wisdom
  6: '/uma-tools/icons/utx_ico_friend_01.png', // Friend
  7: '/uma-tools/icons/utx_ico_group_01.png', // Group
};

// Normalize banner data from GameTora
// GameTora structure: { id, start, end, lineup, pickups }
// - start/end are Unix timestamps (seconds)
// - pickups is array of [cardId, rarity, isNew] tuples
function normalizeBanner(raw: any): Banner | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id ?? 0;
  const name = raw.name ?? '';

  // Convert Unix timestamps (seconds) to ISO date strings
  const startTs = raw.start ?? raw.startDate;
  const endTs = raw.end ?? raw.endDate;

  // Handle both Unix timestamps (numbers) and existing date strings
  const startDate = typeof startTs === 'number'
    ? new Date(startTs * 1000).toISOString()
    : (startTs ?? '');
  const endDate = typeof endTs === 'number'
    ? new Date(endTs * 1000).toISOString()
    : (endTs ?? '');

  // Extract card IDs from pickup tuples [[cardId, rarity, isNew], ...]
  const rawPickups = raw.pickups ?? raw.pickupIds ?? [];
  const pickupIds: number[] = Array.isArray(rawPickups)
    ? rawPickups.map((p: any) => Array.isArray(p) ? p[0] : p).filter((id: any) => typeof id === 'number')
    : [];

  // Skip banners without essential data
  if (!id || !endDate) return null;

  return { id, name, startDate, endDate, pickupIds };
}

// Fetch banners from GameTora (with CORS proxy fallback)
async function fetchGlobalBanners(): Promise<BannerData | null> {
  console.log('[Banners] Starting fetch...');

  // Check cache first
  try {
    const cached = localStorage.getItem(BANNERS_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as BannerData;
      const cacheAge = Date.now() - data.fetchedAt;
      const now = Date.now();
      console.log('[Banners] Found cache, age:', Math.round(cacheAge / 1000), 'seconds');

      // Check if any cached banner has ended - if so, refetch to get new banners
      const allBanners = [...data.characters, ...data.supports];
      const anyBannerEnded = allBanners.some(b => {
        if (!b.endDate) return false;
        const endTime = new Date(b.endDate).getTime();
        return !isNaN(endTime) && endTime < now;
      });

      if (anyBannerEnded) {
        console.log('[Banners] A cached banner has ended, refetching for new data');
        localStorage.removeItem(BANNERS_CACHE_KEY);
      } else if (cacheAge < BANNERS_CACHE_TTL) {
        // Validate cached data has valid banners
        const hasValidBanners = data.characters.some(b => b.endDate && !isNaN(new Date(b.endDate).getTime())) ||
                                data.supports.some(b => b.endDate && !isNaN(new Date(b.endDate).getTime()));
        if (hasValidBanners) {
          // Also check if cache has pickups that resolve
          const hasPickups = data.characters.some(b => b.pickupIds?.some(id => data.charLookup[id])) ||
                            data.supports.some(b => b.pickupIds?.some(id => data.supportLookup[id]));
          if (hasPickups) {
            console.log('[Banners] Using valid cache with pickups');
            return data;
          }
          console.log('[Banners] Cache has no resolvable pickups, clearing');
          localStorage.removeItem(BANNERS_CACHE_KEY);
        }
        // Cache has invalid data, clear it
        console.log('[Banners] Cache invalid, clearing');
        localStorage.removeItem(BANNERS_CACHE_KEY);
      } else {
        console.log('[Banners] Cache expired (TTL)');
      }
    } else {
      console.log('[Banners] No cache found');
    }
  } catch (e) {
    console.warn('[Banners] Failed to load cache:', e);
  }

  try {
    console.log('[Banners] Fetching from GameTora...');
    // Try direct fetch first (might work if CORS is enabled)
    const res = await fetch('https://gametora.com/umamusume/gacha?server=en');
    console.log('[Banners] Fetch response:', res.status, res.statusText);
    const html = await res.text();
    console.log('[Banners] Got HTML, length:', html.length);

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/);
    if (!match) {
      console.warn('Could not find banner data in response');
      return null;
    }

    const data = JSON.parse(match[1]);
    const props = data.props.pageProps;

    // Debug: log the structure to understand it
    const firstCharBanner = props.currentCharBanners?.en?.[0];
    const firstSupportBanner = props.currentSupportBanners?.en?.[0];
    console.log('GameTora banner data structure:', {
      charBannerKeys: firstCharBanner ? Object.keys(firstCharBanner).join(', ') : 'none',
      supportBannerKeys: firstSupportBanner ? Object.keys(firstSupportBanner).join(', ') : 'none',
      firstCharBanner,
      firstSupportBanner,
    });

    // Debug: log card data structure
    const firstCharCard = props.charCardData?.en?.[0];
    const firstSupportCard = props.supportCardData?.en?.[0];
    console.log('GameTora card data structure:', {
      charCardKeys: firstCharCard ? Object.keys(firstCharCard).join(', ') : 'none',
      supportCardKeys: firstSupportCard ? Object.keys(firstSupportCard).join(', ') : 'none',
      firstCharCard,
      firstSupportCard,
    });

    const charLookup = Object.fromEntries(
      (props.charCardData?.en || []).map((c: CharCard) => [c.id, c])
    );
    const supportLookup = Object.fromEntries(
      (props.supportCardData?.en || []).map((s: SupportCard) => [s.id, s])
    );

    // Normalize banners and filter out invalid ones
    const characters = (props.currentCharBanners?.en || [])
      .map(normalizeBanner)
      .filter((b: Banner | null): b is Banner => b !== null);
    const supports = (props.currentSupportBanners?.en || [])
      .map(normalizeBanner)
      .filter((b: Banner | null): b is Banner => b !== null);

    const bannerData: BannerData = {
      characters,
      supports,
      charLookup,
      supportLookup,
      fetchedAt: Date.now(),
    };

    // Cache the result
    try {
      localStorage.setItem(BANNERS_CACHE_KEY, JSON.stringify(bannerData));
    } catch (e) {
      console.warn('Failed to cache banner data:', e);
    }

    return bannerData;
  } catch (e) {
    console.warn('[Banners] Failed to fetch:', e);
    return null;
  }
}

// Format banner end date
function formatBannerEndDate(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

// Format countdown to banner start
function formatBannerStartCountdown(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return 'Starting now';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  if (days > 0) return `Starts in ${days}d ${hours}h`;
  return `Starts in ${hours}h`;
}

// Format banner start time in user's timezone
function formatBannerStartTime(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// Load preferences from localStorage
function loadPrefs(): Preferences {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load prefs:', e);
  }
  return DEFAULT_PREFS;
}

// Countdown time remaining
interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function calculateTimeRemaining(target: Date): TimeRemaining {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  };
}

// Custom hook for countdown timer
function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(
    targetDate ? calculateTimeRemaining(targetDate) : { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  );

  useEffect(() => {
    if (!targetDate) return;

    setTimeLeft(calculateTimeRemaining(targetDate));

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeRemaining(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate?.getTime()]);

  return timeLeft;
}

// CM Event Phases
type CMPhase = 'upcoming' | 'r1d1' | 'r1d2' | 'r2d1' | 'r2d2' | 'registration' | 'finals' | 'ended';

interface CMPhaseInfo {
  phase: CMPhase;
  label: string;
  shortLabel: string;
  nextPhase: CMPhase | null;
  nextPhaseLabel: string | null;
  nextPhaseTime: Date | null;
  progressPercent: number; // 0-100 within current phase
}

// Phase durations in hours from event start
const CM_PHASE_HOURS: Record<CMPhase, { start: number; end: number }> = {
  upcoming: { start: -Infinity, end: 0 },
  r1d1: { start: 0, end: 24 },
  r1d2: { start: 24, end: 48 },
  r2d1: { start: 48, end: 72 },
  r2d2: { start: 72, end: 96 },
  registration: { start: 96, end: 120 },
  finals: { start: 120, end: 144 },
  ended: { start: 144, end: Infinity },
};

const CM_PHASE_LABELS: Record<CMPhase, { label: string; short: string }> = {
  upcoming: { label: 'Starting Soon', short: 'Soon' },
  r1d1: { label: 'Round 1 - Day 1', short: 'R1D1' },
  r1d2: { label: 'Round 1 - Day 2', short: 'R1D2' },
  r2d1: { label: 'Round 2 - Day 1', short: 'R2D1' },
  r2d2: { label: 'Round 2 - Day 2', short: 'R2D2' },
  registration: { label: 'Finals Registration', short: 'Finals Reg' },
  finals: { label: 'Finals', short: 'Finals' },
  ended: { label: 'Event Ended', short: 'Ended' },
};

const PHASE_ORDER: CMPhase[] = ['upcoming', 'r1d1', 'r1d2', 'r2d1', 'r2d2', 'registration', 'finals', 'ended'];

function getCMPhaseInfo(eventStart: Date): CMPhaseInfo {
  const now = Date.now();
  const startTime = eventStart.getTime();
  const hoursSinceStart = (now - startTime) / (1000 * 60 * 60);

  // Find current phase
  let currentPhase: CMPhase = 'upcoming';
  for (const phase of PHASE_ORDER) {
    const { start, end } = CM_PHASE_HOURS[phase];
    if (hoursSinceStart >= start && hoursSinceStart < end) {
      currentPhase = phase;
      break;
    }
  }

  // Calculate progress within current phase
  const { start, end } = CM_PHASE_HOURS[currentPhase];
  const phaseDuration = end - start;
  const phaseElapsed = hoursSinceStart - start;
  const phaseProgressPercent = Math.min(100, Math.max(0, (phaseElapsed / phaseDuration) * 100));

  // Find next phase
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  // Calculate overall progress across all visible phases (r1d1 through finals = 6 phases)
  // The progress bar spans from r1d1 (index 1) to finals (index 6)
  const visiblePhases = PHASE_ORDER.slice(1, -1); // ['r1d1', 'r1d2', 'r2d1', 'r2d2', 'registration', 'finals']
  const numVisiblePhases = visiblePhases.length;
  const visiblePhaseIndex = visiblePhases.indexOf(currentPhase);

  let progressPercent = 0;
  if (visiblePhaseIndex >= 0) {
    // Progress = completed phases + progress within current phase
    progressPercent = ((visiblePhaseIndex + phaseProgressPercent / 100) / numVisiblePhases) * 100;
  } else if (currentPhase === 'ended') {
    progressPercent = 100;
  }
  const nextPhase = currentIndex < PHASE_ORDER.length - 1 ? PHASE_ORDER[currentIndex + 1] : null;

  // Calculate next phase start time
  let nextPhaseTime: Date | null = null;
  let nextPhaseLabel: string | null = null;
  if (nextPhase && nextPhase !== 'ended') {
    const nextPhaseHours = CM_PHASE_HOURS[nextPhase].start;
    nextPhaseTime = new Date(startTime + nextPhaseHours * 60 * 60 * 1000);
    nextPhaseLabel = CM_PHASE_LABELS[nextPhase].label;
  }

  return {
    phase: currentPhase,
    label: CM_PHASE_LABELS[currentPhase].label,
    shortLabel: CM_PHASE_LABELS[currentPhase].short,
    nextPhase,
    nextPhaseLabel,
    nextPhaseTime,
    progressPercent,
  };
}

// Custom hook for CM phase tracking
function useCMPhase(eventStart: Date | null): CMPhaseInfo | null {
  const [phaseInfo, setPhaseInfo] = useState<CMPhaseInfo | null>(
    eventStart ? getCMPhaseInfo(eventStart) : null
  );

  useEffect(() => {
    if (!eventStart) return;

    setPhaseInfo(getCMPhaseInfo(eventStart));

    const timer = setInterval(() => {
      setPhaseInfo(getCMPhaseInfo(eventStart));
    }, 1000);

    return () => clearInterval(timer);
  }, [eventStart?.getTime()]);

  return phaseInfo;
}

// Get event start date (22:00 UTC on the event date)
function getEventStartDate(preset: Preset): Date {
  // Handle both YYYY-MM-DD and YYYY-MM formats
  const dateStr = preset.date;
  let year: number, month: number, day: number;

  if (dateStr.length === 7) {
    // YYYY-MM format - assume first day of month
    [year, month] = dateStr.split('-').map(Number);
    day = 1;
  } else {
    // YYYY-MM-DD format
    [year, month, day] = dateStr.split('-').map(Number);
  }

  // Event starts at 22:00 UTC
  return new Date(Date.UTC(year, month - 1, day, 22, 0, 0));
}

// Format date for display in user's local timezone
function formatEventDate(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// Get course info from course data
function getCourseInfo(courseId: number): { track: string; distance: number; surface: string } | null {
  const course = (courseData as Record<string, any>)[String(courseId)];
  if (!course) return null;

  const trackName = (tracknames as Record<string, string[]>)[String(course.raceTrackId)]?.[1] || 'Unknown';
  const surface = course.surface === 1 ? 'Turf' : 'Dirt';

  return {
    track: trackName,
    distance: course.distance,
    surface,
  };
}

// Get condition names
function getGroundName(ground: GroundCondition): string {
  switch (ground) {
    case GroundCondition.Good: return 'Firm';
    case GroundCondition.Yielding: return 'Good';
    case GroundCondition.Soft: return 'Soft';
    case GroundCondition.Heavy: return 'Heavy';
    default: return 'Unknown';
  }
}

function getWeatherName(weather: Weather): string {
  switch (weather) {
    case Weather.Sunny: return 'Sunny';
    case Weather.Cloudy: return 'Cloudy';
    case Weather.Rainy: return 'Rainy';
    case Weather.Snowy: return 'Snowy';
    default: return 'Unknown';
  }
}

function getSeasonName(season: Season): string {
  switch (season) {
    case Season.Spring: return 'Spring';
    case Season.Summer: return 'Summer';
    case Season.Autumn: return 'Autumn';
    case Season.Winter: return 'Winter';
    default: return 'Unknown';
  }
}

function getTimeName(time: Time): string {
  switch (time) {
    case Time.Morning: return 'Morning';
    case Time.Midday: return 'Midday';
    case Time.Evening: return 'Evening';
    case Time.Night: return 'Night';
    default: return 'Unknown';
  }
}

// Icon paths (matching conditions.tsx)
function getWeatherIconSrc(weather: Weather): string {
  return `/uma-tools/icons/utx_ico_weather_0${weather - 1}.png`;
}

function getSeasonIconSrc(season: Season): string {
  return `/uma-tools/icons/global/utx_txt_season_0${season - 1}.png`;
}

function getTimeIconSrc(time: Time): string {
  // Time enum: Morning=1, Midday=2, Evening=3, Night=4
  // Icons only exist for Midday(0), Evening(1), Night(2)
  const iconIndex = time === Time.Morning ? 0 : time - 2;
  return `/uma-tools/icons/utx_ico_timezone_0${iconIndex}.png`;
}

// Flip digit component with animation
function FlipDigit({ digit, id }: { digit: string; id: string }) {
  const [currentDigit, setCurrentDigit] = useState(digit);
  const [previousDigit, setPreviousDigit] = useState(digit);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (digit !== currentDigit) {
      setIsFlipping(true);
      setPreviousDigit(currentDigit);

      // After flip animation completes, update the digit
      const timer = setTimeout(() => {
        setCurrentDigit(digit);
        setIsFlipping(false);
      }, 600); // Match animation duration

      return () => clearTimeout(timer);
    }
  }, [digit, currentDigit]);

  return (
    <div class={`flip-card ${isFlipping ? 'flipping' : ''}`} key={id}>
      <div class="flip-card-inner">
        {/* Static top - shows current (or new during flip) */}
        <div class="flip-card-top">
          <span>{isFlipping ? digit : currentDigit}</span>
        </div>

        {/* Static bottom - shows previous during flip, then current */}
        <div class="flip-card-bottom">
          <span>{currentDigit}</span>
        </div>

        {/* Animated flap - top half that flips down */}
        {isFlipping && (
          <>
            <div class="flip-card-flap flip-card-flap-top">
              <span>{previousDigit}</span>
            </div>
            <div class="flip-card-flap flip-card-flap-bottom">
              <span>{digit}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);
  const [banners, setBanners] = useState<BannerData | null>(null);
  const [bannersLoading, setBannersLoading] = useState(true);

  // Save prefs
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Apply theme
  useEffect(() => {
    document.body.classList.toggle('light', !prefs.darkMode);
  }, [prefs.darkMode]);

  // Fetch banners on mount
  useEffect(() => {
    console.log('[App] Fetching banners on mount...');
    fetchGlobalBanners()
      .then(data => {
        console.log('[App] Banner fetch complete, data:', data ? 'received' : 'null');
        setBanners(data);
        setBannersLoading(false);
      })
      .catch((e) => {
        console.error('[App] Banner fetch error:', e);
        setBannersLoading(false);
      });
  }, []);

  // Get CM events only
  const cmEvents = useMemo(() => {
    return presets.filter(p => p.type === EventType.CM);
  }, []);

  // Get next upcoming event
  const nextEvent = useMemo(() => {
    const now = new Date();
    const upcoming = cmEvents.filter(event => {
      const eventDate = getEventStartDate(event);
      // Consider event "past" if it started more than 7 days ago (typical CM duration)
      const eventEndApprox = new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      return eventEndApprox >= now;
    });

    // Sort upcoming by date ascending (soonest first)
    upcoming.sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime());

    return upcoming[0] || null;
  }, [cmEvents]);

  // Countdown to next event
  const nextEventDate = nextEvent ? getEventStartDate(nextEvent) : null;
  const countdown = useCountdown(nextEventDate);

  // Track CM phase for currently running event
  const cmPhase = useCMPhase(nextEventDate);
  const isEventInProgress = cmPhase && cmPhase.phase !== 'upcoming' && cmPhase.phase !== 'ended';

  // Countdown to next phase (when event is in progress)
  const phaseCountdown = useCountdown(cmPhase?.nextPhaseTime ?? null);

  const toggleTheme = () => {
    setPrefs(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  return (
    <div class="events-app">
      {/* Header */}
      <header class="events-header">
        <div class="events-header-title">
          <Calendar size={20} />
          Events
        </div>
        <div class="events-header-controls">
          {/* Theme toggle */}
          <button
            class="btn btn-icon btn-ghost"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {prefs.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Apps dropdown */}
          <div class="apps-dropdown">
            <button
              class="btn btn-icon btn-ghost"
              onClick={() => setAppsMenuOpen(!appsMenuOpen)}
              title="More apps"
            >
              <Menu size={18} />
            </button>
            {appsMenuOpen && (
              <>
                <div
                  class="apps-dropdown-backdrop"
                  onClick={() => setAppsMenuOpen(false)}
                />
                <div class="apps-dropdown-menu">
                  <a
                    href="/umalator-global/"
                    class="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Calculator size={16} />
                    Umalator
                  </a>
                  <a
                    href="/hp-calculator/"
                    class="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Zap size={16} />
                    HP Calculator
                  </a>
                  <a
                    href="/docs/"
                    class="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Book size={16} />
                    Docs
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main class="events-main">
        {nextEvent ? (
          <>
            {/* Column 1: Current Banners */}
            {(() => {
              const now = Date.now();

              // Get banners from GameTora API
              const validCharBanners = banners?.characters.filter(b =>
                b.pickupIds?.some(id => banners.charLookup[id]) &&
                b.endDate && new Date(b.endDate).getTime() > now
              ) ?? [];
              const validSupportBanners = banners?.supports.filter(b =>
                b.pickupIds?.some(id => banners.supportLookup[id]) &&
                b.endDate && new Date(b.endDate).getTime() > now
              ) ?? [];

              const hasGameToraBanners = validCharBanners.length > 0 || validSupportBanners.length > 0;

              // Fallback: Get currently active banners from UPCOMING_BANNERS
              const activeFallbackBanners = UPCOMING_BANNERS.filter(b => {
                const start = new Date(b.startDate).getTime();
                const end = new Date(b.endDate).getTime();
                return start <= now && end > now;
              });

              // Don't show section if no banners from either source
              if (!hasGameToraBanners && activeFallbackBanners.length === 0) {
                return null;
              }

              return (
                <section class="events-section current-banners">
                  <div class="banners-section-card">
                    <h2 class="section-title">Current Banners</h2>
                    {hasGameToraBanners ? (
                      <div class="banners-grid">
                        {validCharBanners.map(banner => (
                          <a
                            key={`char-${banner.id}`}
                            href="https://gametora.com/umamusume/gacha?server=en"
                            target="_blank"
                            rel="noopener"
                            class="banner-card banner-card-link"
                          >
                            <img
                              src={`https://gametora.com/images/umamusume/en/gacha/img_bnr_gacha_${banner.id}.png`}
                              alt="Character Banner"
                              class="banner-image"
                              loading="lazy"
                            />
                            <div class="banner-footer">
                              <span class="banner-type char">Character</span>
                              <span class="banner-timer">{formatBannerEndDate(banner.endDate)}</span>
                            </div>
                          </a>
                        ))}
                        {validSupportBanners.map(banner => (
                          <a
                            key={`supp-${banner.id}`}
                            href="https://gametora.com/umamusume/gacha?server=en"
                            target="_blank"
                            rel="noopener"
                            class="banner-card banner-card-link"
                          >
                            <img
                              src={`https://gametora.com/images/umamusume/en/gacha/img_bnr_gacha_${banner.id}.png`}
                              alt="Support Banner"
                              class="banner-image"
                              loading="lazy"
                            />
                            <div class="banner-footer">
                              <span class="banner-type support">Support</span>
                              <span class="banner-timer">{formatBannerEndDate(banner.endDate)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      /* Fallback: show manually maintained banners */
                      <div class="fallback-banners-list">
                        {activeFallbackBanners.map((banner, i) => (
                          <div key={i} class="fallback-banner-item">
                            <div class="fallback-banner-timer">
                              {formatBannerEndDate(banner.endDate)}
                            </div>
                            <div class="fallback-banner-content">
                              <div class="fallback-banner-group">
                                <span class="upcoming-banner-type char">Characters</span>
                                <ul class="upcoming-banner-names">
                                  {banner.characters.map((name, j) => (
                                    <li key={j}>{name}</li>
                                  ))}
                                </ul>
                              </div>
                              <div class="fallback-banner-group">
                                <span class="upcoming-banner-type support">Supports</span>
                                <ul class="upcoming-banner-names">
                                  {banner.supports.map((name, j) => (
                                    <li key={j}>{name}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* Column 2: PVP Countdown */}
            <div class={`next-event-card ${isEventInProgress ? 'event-live' : ''}`}>
              {isEventInProgress ? (
                <>
                  <div class="event-live-badge">EVENT IN PROGRESS</div>
                  <h1 class="next-event-name">{nextEvent.name}</h1>

                  {/* Current Phase */}
                  <div class="phase-display">
                    <div class="phase-current">
                      <span class="phase-label">Current Phase</span>
                      <span class="phase-name">{cmPhase?.label}</span>
                    </div>

                    {/* Phase Progress Bar */}
                    <div class="phase-progress">
                      <div class="phase-progress-bar" style={{ width: `${cmPhase?.progressPercent ?? 0}%` }} />
                      <div class="phase-progress-markers">
                        {PHASE_ORDER.slice(1, -1).map((phase) => {
                          const currentPhaseIndex = PHASE_ORDER.indexOf(cmPhase?.phase ?? 'upcoming');
                          const thisPhaseIndex = PHASE_ORDER.indexOf(phase);
                          return (
                            <div
                              key={phase}
                              class={`phase-marker ${currentPhaseIndex > thisPhaseIndex ? 'completed' : ''} ${cmPhase?.phase === phase ? 'active' : ''}`}
                              title={CM_PHASE_LABELS[phase].label}
                            >
                              <span class="phase-marker-label">{CM_PHASE_LABELS[phase].short}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Countdown to next phase - Flip Clock Style */}
                    {cmPhase?.nextPhaseTime && (
                      <div class="phase-next">
                        <span class="phase-next-label">{cmPhase.nextPhaseLabel} in</span>
                        <div class="countdown countdown-compact">
                          <div class="countdown-segment">
                            <div class="countdown-cards">
                              {String(phaseCountdown.hours).padStart(2, '0').split('').map((digit, i) => (
                                <FlipDigit key={`phase-hours-${i}`} digit={digit} id={`phase-hours-${i}`} />
                              ))}
                            </div>
                            <span class="countdown-label">Hours</span>
                          </div>
                          <span class="countdown-separator">:</span>
                          <div class="countdown-segment">
                            <div class="countdown-cards">
                              {String(phaseCountdown.minutes).padStart(2, '0').split('').map((digit, i) => (
                                <FlipDigit key={`phase-min-${i}`} digit={digit} id={`phase-min-${i}`} />
                              ))}
                            </div>
                            <span class="countdown-label">Min</span>
                          </div>
                          <span class="countdown-separator">:</span>
                          <div class="countdown-segment">
                            <div class="countdown-cards">
                              {String(phaseCountdown.seconds).padStart(2, '0').split('').map((digit, i) => (
                                <FlipDigit key={`phase-sec-${i}`} digit={digit} id={`phase-sec-${i}`} />
                              ))}
                            </div>
                            <span class="countdown-label">Sec</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div class="next-event-label">Next Champion's Meeting</div>
                  <h1 class="next-event-name">{nextEvent.name}</h1>

                  {/* Countdown - Flip Clock Style */}
                  <div class="countdown">
                    <div class="countdown-segment">
                      <div class="countdown-cards">
                        {String(countdown.days).padStart(2, '0').split('').map((digit, i) => (
                          <FlipDigit key={`days-${i}`} digit={digit} id={`days-${i}`} />
                        ))}
                      </div>
                      <span class="countdown-label">Days</span>
                    </div>
                    <span class="countdown-separator">:</span>
                    <div class="countdown-segment">
                      <div class="countdown-cards">
                        {String(countdown.hours).padStart(2, '0').split('').map((digit, i) => (
                          <FlipDigit key={`hours-${i}`} digit={digit} id={`hours-${i}`} />
                        ))}
                      </div>
                      <span class="countdown-label">Hours</span>
                    </div>
                    <span class="countdown-separator">:</span>
                    <div class="countdown-segment">
                      <div class="countdown-cards">
                        {String(countdown.minutes).padStart(2, '0').split('').map((digit, i) => (
                          <FlipDigit key={`min-${i}`} digit={digit} id={`min-${i}`} />
                        ))}
                      </div>
                      <span class="countdown-label">Min</span>
                    </div>
                    <span class="countdown-separator">:</span>
                    <div class="countdown-segment">
                      <div class="countdown-cards">
                        {String(countdown.seconds).padStart(2, '0').split('').map((digit, i) => (
                          <FlipDigit key={`sec-${i}`} digit={digit} id={`sec-${i}`} />
                        ))}
                      </div>
                      <span class="countdown-label">Sec</span>
                    </div>
                  </div>
                </>
              )}

              {/* Event Details */}
              <div class="next-event-details">
                <div class="event-detail">
                  <Clock size={16} />
                  <span>{nextEventDate && formatEventDate(nextEventDate)}</span>
                </div>

                {(() => {
                  const courseInfo = getCourseInfo(nextEvent.courseId);
                  return courseInfo ? (
                    <div class="event-detail">
                      <MapPin size={16} />
                      <span>{courseInfo.track} {courseInfo.distance}m {courseInfo.surface}</span>
                    </div>
                  ) : null;
                })()}

                <div class="event-conditions">
                  <span class="condition-tag">
                    <img src={getWeatherIconSrc(nextEvent.weather)} alt="" class="condition-icon" />
                    {getWeatherName(nextEvent.weather)}
                  </span>
                  <span class="condition-tag">
                    {getGroundName(nextEvent.ground)}
                  </span>
                  <span class="condition-tag">
                    <img src={getSeasonIconSrc(nextEvent.season)} alt="" class="condition-icon" />
                    {getSeasonName(nextEvent.season)}
                  </span>
                  <span class="condition-tag">
                    <img src={getTimeIconSrc(nextEvent.time)} alt="" class="condition-icon" />
                    {getTimeName(nextEvent.time)}
                  </span>
                </div>
              </div>

              {/* Simulator link */}
              <a
                href={`/v2/?preset=${nextEvent.id}`}
                class="simulator-link"
              >
                <Calculator size={16} />
                Open in Umalator
                <ExternalLink size={14} />
              </a>
            </div>

            {/* Column 3: Upcoming Banners */}
            {(() => {
              const now = Date.now();
              // Filter to banners that haven't started yet
              const upcomingBanners = UPCOMING_BANNERS.filter(b =>
                new Date(b.startDate).getTime() > now
              );

              if (upcomingBanners.length === 0) return null;

              return (
                <section class="events-section upcoming-banners">
                  <div class="banners-section-card">
                    <h2 class="section-title">Upcoming Banners</h2>
                    <div class="upcoming-banners-list">
                      {upcomingBanners.map((banner, i) => {
                        const end = new Date(banner.endDate);
                        return (
                          <div key={i} class="upcoming-banner-item">
                            <div class="upcoming-banner-header">
                              <div class="upcoming-banner-dates-col">
                                <div class="upcoming-banner-date-col">
                                  <span class="upcoming-banner-date-label">Starts</span>
                                  <span class="upcoming-banner-date-value">{formatBannerStartTime(banner.startDate)}</span>
                                </div>
                                <div class="upcoming-banner-date-col">
                                  <span class="upcoming-banner-date-label">Ends</span>
                                  <span class="upcoming-banner-date-value">{end.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
                                </div>
                              </div>
                              <span class="upcoming-banner-countdown">{formatBannerStartCountdown(banner.startDate)}</span>
                            </div>
                            <div class="upcoming-banner-content">
                              <div class="upcoming-banner-group">
                                <span class="upcoming-banner-type char">Characters</span>
                                <ul class="upcoming-banner-names">
                                  {banner.characters.map((name, j) => (
                                    <li key={j}>{name}</li>
                                  ))}
                                </ul>
                              </div>
                              <div class="upcoming-banner-group">
                                <span class="upcoming-banner-type support">Supports</span>
                                <ul class="upcoming-banner-names">
                                  {banner.supports.map((name, j) => (
                                    <li key={j}>{name}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })()}

          </>
        ) : (
          <>
            <div class="no-banners-placeholder" />
            <div class="no-events">
              <Calendar size={48} />
              <p>No upcoming events</p>
            </div>
            <div class="no-banners-placeholder" />
          </>
        )}
      </main>

      {/* Footer */}
      <footer class="events-footer">
        <p>
          Times shown in your local timezone.
          Event schedules subject to change.
        </p>
      </footer>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
