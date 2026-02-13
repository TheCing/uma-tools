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
  ChevronDown,
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

interface Preferences {
  darkMode: boolean;
}

const DEFAULT_PREFS: Preferences = {
  darkMode: true,
};

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

// Format short date
function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  const [showPastEvents, setShowPastEvents] = useState(false);

  // Save prefs
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Apply theme
  useEffect(() => {
    document.body.classList.toggle('light', !prefs.darkMode);
  }, [prefs.darkMode]);

  // Get CM events only
  const cmEvents = useMemo(() => {
    return presets.filter(p => p.type === EventType.CM);
  }, []);

  // Separate upcoming and past events
  const { upcomingEvents, pastEvents, nextEvent } = useMemo(() => {
    const now = new Date();
    const upcoming: Preset[] = [];
    const past: Preset[] = [];

    cmEvents.forEach(event => {
      const eventDate = getEventStartDate(event);
      // Consider event "past" if it started more than 7 days ago (typical CM duration)
      const eventEndApprox = new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (eventEndApprox < now) {
        past.push(event);
      } else {
        upcoming.push(event);
      }
    });

    // Sort upcoming by date ascending (soonest first)
    upcoming.sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime());
    // Sort past by date descending (most recent first)
    past.sort((a, b) => getEventStartDate(b).getTime() - getEventStartDate(a).getTime());

    return {
      upcomingEvents: upcoming,
      pastEvents: past,
      nextEvent: upcoming[0] || null,
    };
  }, [cmEvents]);

  // Countdown to next event
  const nextEventDate = nextEvent ? getEventStartDate(nextEvent) : null;
  const countdown = useCountdown(nextEventDate);

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
            {/* Next Event Card */}
            <div class="next-event-card">
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
                href={`/umalator-global/?preset=${nextEvent.id}`}
                target="_blank"
                rel="noopener"
                class="simulator-link"
              >
                <Calculator size={16} />
                Open in Umalator
                <ExternalLink size={14} />
              </a>
            </div>

            {/* Upcoming Events */}
            {upcomingEvents.length > 1 && (
              <section class="events-section">
                <h2 class="section-title">Upcoming Events</h2>
                <div class="events-list">
                  {upcomingEvents.slice(1).map(event => {
                    const eventDate = getEventStartDate(event);
                    const courseInfo = getCourseInfo(event.courseId);
                    return (
                      <div key={event.id} class="event-row">
                        <div class="event-row-main">
                          <span class="event-row-name">{event.name}</span>
                          <span class="event-row-date">{formatShortDate(eventDate)}</span>
                        </div>
                        <div class="event-row-details">
                          {courseInfo && (
                            <span class="event-row-course">
                              {courseInfo.track} {courseInfo.distance}m
                            </span>
                          )}
                          <span class="event-row-conditions">
                            <img src={getWeatherIconSrc(event.weather)} alt="" class="condition-icon-sm" />
                            {getGroundName(event.ground)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <div class="no-events">
            <Calendar size={48} />
            <p>No upcoming events</p>
          </div>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <section class="events-section past-events">
            <button
              class="section-toggle"
              onClick={() => setShowPastEvents(!showPastEvents)}
            >
              <h2 class="section-title">Past Events</h2>
              <ChevronDown
                size={18}
                class={`toggle-chevron ${showPastEvents ? 'open' : ''}`}
              />
            </button>
            {showPastEvents && (
              <div class="events-list">
                {pastEvents.map(event => {
                  const eventDate = getEventStartDate(event);
                  const courseInfo = getCourseInfo(event.courseId);
                  return (
                    <div key={event.id} class="event-row past">
                      <div class="event-row-main">
                        <span class="event-row-name">{event.name}</span>
                        <span class="event-row-date">{formatShortDate(eventDate)}</span>
                      </div>
                      <div class="event-row-details">
                        {courseInfo && (
                          <span class="event-row-course">
                            {courseInfo.track} {courseInfo.distance}m
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
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
