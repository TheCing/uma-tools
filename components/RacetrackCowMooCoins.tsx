/**
 * RacetrackCow with MooCoins investment system
 * DEV-ONLY easter egg - wraps RacetrackCow with currency/market features
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { RacetrackCow } from './RacetrackCow';

import './RacetrackCowMooCoins.css';

interface RacetrackCowMooCoinsProps {
	trackWidth: number;
}

// MooCoin config
const MOOCOIN_STORAGE_KEY = 'moomoocord_moocoins';
const MICROCOIN_PER_COIN = 300000; // ~5 minutes of walking at 1 microcoin per ms
const INVESTMENTS_STORAGE_KEY = 'moomoocord_investments';

// Investment types
interface Investments {
	shnailCoins: number;
	ramenCoins: number;
	aderynCoins: number;
	glassesCoins: number;
	meloCoins: number;
	redShiftCoins: number;
}

// Market data
interface MarketPrices {
	shnailCoins: number;
	ramenCoins: number;
	aderynCoins: number;
	glassesCoins: number;
	meloCoins: number;
	redShiftCoins: number;
}

interface PriceHistory {
	shnailCoins: number[];
	ramenCoins: number[];
	aderynCoins: number[];
	glassesCoins: number[];
	meloCoins: number[];
	redShiftCoins: number[];
}

const MARKET_STORAGE_KEY = 'moomoocord_market';
const PRICE_UPDATE_INTERVAL = 5000; // 5 seconds
const PRICE_HISTORY_LENGTH = 20;

// Base prices and volatility for each coin
const COIN_CONFIG = {
	shnailCoins: { basePrice: 1.0, volatility: 0.15, icon: '🐌', name: 'ShnailCoin', ticker: 'SHNL' },
	ramenCoins: { basePrice: 2.5, volatility: 0.25, icon: '🍜', name: 'RamenCoin', ticker: 'RAMN' },
	aderynCoins: { basePrice: 5.0, volatility: 0.35, icon: '🦅', name: 'AderynCoin', ticker: 'ADRN' },
	glassesCoins: { basePrice: 10.0, volatility: 0.45, icon: '👓', name: 'GlassesCoin', ticker: 'GLSS' },
	meloCoins: { basePrice: 20.0, volatility: 0.55, icon: '🎵', name: 'MeloCoin', ticker: 'MLO' },
	redShiftCoins: { basePrice: 30.0, volatility: 0.65, icon: '🔥', name: 'RedShiftCoin', ticker: 'RDS' },
};

interface MarketState {
	prices: MarketPrices;
	history: PriceHistory;
	lastUpdate: number;
}

function defaultMarketState(): MarketState {
	const prices = {} as MarketPrices;
	const history = {} as PriceHistory;
	for (const [coin, config] of Object.entries(COIN_CONFIG)) {
		const key = coin as keyof typeof COIN_CONFIG;
		prices[key] = config.basePrice;
		history[key] = [config.basePrice];
	}
	return { prices, history, lastUpdate: Date.now() };
}

function loadMarketState(): MarketState {
	try {
		const stored = localStorage.getItem(MARKET_STORAGE_KEY);
		if (stored) {
			const data = JSON.parse(stored);
			if (data.prices && data.history && data.lastUpdate) {
				// Backfill any missing coins from defaults
				const defaults = defaultMarketState();
				for (const coin of Object.keys(COIN_CONFIG) as Array<keyof typeof COIN_CONFIG>) {
					if (data.prices[coin] == null) data.prices[coin] = defaults.prices[coin];
					if (!data.history[coin]) data.history[coin] = defaults.history[coin];
				}
				return data;
			}
		}
	} catch (e) {
		console.error('Failed to load market state:', e);
	}
	return defaultMarketState();
}

function saveMarketState(state: MarketState): void {
	try {
		localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(state));
	} catch (e) {
		console.error('Failed to save market state:', e);
	}
}

function updatePrice(currentPrice: number, basePrice: number, volatility: number): number {
	const drift = (basePrice - currentPrice) * 0.1;
	const randomChange = (Math.random() - 0.5) * 2 * volatility * currentPrice;
	const newPrice = Math.max(0.01, currentPrice + drift + randomChange);
	return Math.round(newPrice * 100) / 100;
}

// MooCoin localStorage helpers
function loadMooCoins(): { coins: number; microCoins: number } {
	try {
		const stored = localStorage.getItem(MOOCOIN_STORAGE_KEY);
		if (stored) {
			const data = JSON.parse(stored);
			return {
				coins: typeof data.coins === 'number' ? data.coins : 0,
				microCoins: typeof data.microCoins === 'number' ? data.microCoins : 0,
			};
		}
	} catch (e) {
		console.error('Failed to load MooCoins:', e);
	}
	return { coins: 0, microCoins: 0 };
}

function saveMooCoins(coins: number, microCoins: number): void {
	try {
		localStorage.setItem(MOOCOIN_STORAGE_KEY, JSON.stringify({ coins, microCoins }));
	} catch (e) {
		console.error('Failed to save MooCoins:', e);
	}
}

// Wallet address encoding/decoding
function generateWalletAddress(coins: number, microCoins: number): string {
	const data = { c: coins, m: Math.round(microCoins) };
	const encoded = btoa(JSON.stringify(data)).replace(/=/g, '');
	const checksum = ((coins * 7 + Math.round(microCoins)) % 9999).toString(16).toUpperCase().padStart(4, '0');
	return `MOO${encoded}${checksum}`;
}

function parseWalletAddress(address: string): { coins: number; microCoins: number } | null {
	try {
		if (!address.startsWith('MOO') || address.length < 12) return null;
		const encoded = address.slice(3, -4);
		if (!encoded) return null;
		if (!/^[A-Za-z0-9+/]*$/.test(encoded)) return null;
		const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
		const data = JSON.parse(atob(padded));
		if (typeof data.c === 'number' && typeof data.m === 'number') {
			return { coins: data.c, microCoins: data.m };
		}
	} catch {
		// Silent fail
	}
	return null;
}

function loadInvestments(): Investments {
	try {
		const stored = localStorage.getItem(INVESTMENTS_STORAGE_KEY);
		if (stored) {
			const data = JSON.parse(stored);
			return {
				shnailCoins: typeof data.shnailCoins === 'number' ? data.shnailCoins : 0,
				ramenCoins: typeof data.ramenCoins === 'number' ? data.ramenCoins : 0,
				aderynCoins: typeof data.aderynCoins === 'number' ? data.aderynCoins : 0,
				glassesCoins: typeof data.glassesCoins === 'number' ? data.glassesCoins : 0,
				meloCoins: typeof data.meloCoins === 'number' ? data.meloCoins : 0,
				redShiftCoins: typeof data.redShiftCoins === 'number' ? data.redShiftCoins : 0,
			};
		}
	} catch (e) {
		console.error('Failed to load investments:', e);
	}
	return { shnailCoins: 0, ramenCoins: 0, aderynCoins: 0, glassesCoins: 0, meloCoins: 0, redShiftCoins: 0 };
}

function saveInvestments(investments: Investments): void {
	try {
		localStorage.setItem(INVESTMENTS_STORAGE_KEY, JSON.stringify(investments));
	} catch (e) {
		console.error('Failed to save investments:', e);
	}
}

// Confetti particle
interface ConfettiParticle {
	id: number;
	x: number;
	y: number;
	color: string;
	rotation: number;
	scale: number;
}

// Floating coin animation
interface FloatingCoin {
	id: number;
	x: number;
	startTime: number;
}

export function RacetrackCowMooCoins({ trackWidth }: RacetrackCowMooCoinsProps) {
	// MooCoin state
	const savedCoins = useRef(loadMooCoins());
	const [mooCoins, setMooCoins] = useState(savedCoins.current.coins);
	const microCoinsRef = useRef(savedCoins.current.microCoins);
	const [floatingCoins, setFloatingCoins] = useState<FloatingCoin[]>([]);
	const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
	const floatingCoinIdRef = useRef(0);
	const confettiIdRef = useRef(0);
	const lastSaveRef = useRef(Date.now());

	// Investment state
	const [investments, setInvestments] = useState<Investments>(loadInvestments);

	// Market state
	const [market, setMarket] = useState<MarketState>(loadMarketState);
	const [marketExpanded, setMarketExpanded] = useState(false);

	// Wallet toast state
	const [walletToast, setWalletToast] = useState<string | null>(null);

	// Spawn confetti burst
	const spawnConfetti = useCallback((x: number) => {
		const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1'];
		const particles: ConfettiParticle[] = [];
		for (let i = 0; i < 12; i++) {
			particles.push({
				id: confettiIdRef.current++,
				x: x + (Math.random() - 0.5) * 60,
				y: 80 + (Math.random() - 0.5) * 40,
				color: colors[Math.floor(Math.random() * colors.length)],
				rotation: Math.random() * 360,
				scale: 0.5 + Math.random() * 0.5,
			});
		}
		setConfetti(particles);
		setTimeout(() => setConfetti([]), 1500);
	}, []);

	// Award a MooCoin
	const awardCoin = useCallback((cowX: number) => {
		setMooCoins(prev => {
			const newTotal = prev + 1;
			saveMooCoins(newTotal, microCoinsRef.current);
			return newTotal;
		});

		setFloatingCoins(prev => [...prev, {
			id: floatingCoinIdRef.current++,
			x: cowX,
			startTime: Date.now(),
		}]);

		spawnConfetti(cowX);

		setTimeout(() => {
			setFloatingCoins(prev => prev.slice(1));
		}, 1500);
	}, [spawnConfetti]);

	// Buy/sell coins at market price
	const buyCoin = useCallback((coin: keyof Investments) => {
		const price = market.prices[coin];
		if (mooCoins < price) return;

		setMooCoins(prev => {
			const newTotal = Math.round((prev - price) * 100) / 100;
			saveMooCoins(newTotal, microCoinsRef.current);
			return newTotal;
		});
		setInvestments(prev => {
			const updated = { ...prev, [coin]: prev[coin] + 1 };
			saveInvestments(updated);
			return updated;
		});
	}, [mooCoins, market.prices]);

	const sellCoin = useCallback((coin: keyof Investments) => {
		if (investments[coin] <= 0) return;
		const price = market.prices[coin];

		setMooCoins(prev => {
			const newTotal = Math.round((prev + price) * 100) / 100;
			saveMooCoins(newTotal, microCoinsRef.current);
			return newTotal;
		});
		setInvestments(prev => {
			const updated = { ...prev, [coin]: prev[coin] - 1 };
			saveInvestments(updated);
			return updated;
		});
	}, [investments, market.prices]);

	// Calculate portfolio value
	const portfolioValue = useMemo(() => {
		return Object.keys(COIN_CONFIG).reduce((total, coin) => {
			const key = coin as keyof Investments;
			return total + (investments[key] * market.prices[key]);
		}, 0);
	}, [investments, market.prices]);

	// Price change indicator
	const getPriceChange = useCallback((coin: keyof Investments) => {
		const history = market.history[coin];
		if (!history || history.length < 2) return 0;
		const prev = history[history.length - 2];
		const current = history[history.length - 1];
		return ((current - prev) / prev) * 100;
	}, [market.history]);

	// Wallet context menu - right click to copy/paste wallet
	const handleWalletContextMenu = useCallback(async (e: MouseEvent) => {
		e.preventDefault();

		// Try to read clipboard first
		try {
			const clipboardText = await navigator.clipboard.readText();
			const parsed = parseWalletAddress(clipboardText.trim());
			if (parsed) {
				setMooCoins(parsed.coins);
				microCoinsRef.current = parsed.microCoins;
				saveMooCoins(parsed.coins, parsed.microCoins);
				setWalletToast(`Wallet loaded! ${parsed.coins} MooCoins`);
				setTimeout(() => setWalletToast(null), 2500);
				return;
			}
		} catch {
			// Clipboard read failed, fall through to copy
		}

		// Generate and copy wallet address
		const address = generateWalletAddress(mooCoins, microCoinsRef.current);
		console.log('[MooCoin] Generated wallet address:', address);

		let copied = false;
		try {
			await navigator.clipboard.writeText(address);
			copied = true;
		} catch {
			// Fallback to execCommand
			try {
				const textarea = document.createElement('textarea');
				textarea.value = address;
				textarea.style.position = 'fixed';
				textarea.style.opacity = '0';
				document.body.appendChild(textarea);
				textarea.select();
				copied = document.execCommand('copy');
				document.body.removeChild(textarea);
			} catch {
				// Both methods failed
			}
		}

		if (copied) {
			console.log('[MooCoin] Copied to clipboard');
			setWalletToast('Wallet address copied!');
		} else {
			console.error('[MooCoin] Copy failed');
			setWalletToast('Copy failed');
		}
		setTimeout(() => setWalletToast(null), 2500);
	}, [mooCoins]);

	// Market price update effect
	useEffect(() => {
		const updateMarket = () => {
			setMarket(prev => {
				const newPrices = { ...prev.prices };
				const newHistory = { ...prev.history };

				(Object.keys(COIN_CONFIG) as Array<keyof typeof COIN_CONFIG>).forEach(coin => {
					const config = COIN_CONFIG[coin];
					newPrices[coin] = updatePrice(prev.prices[coin], config.basePrice, config.volatility);
					newHistory[coin] = [...prev.history[coin].slice(-PRICE_HISTORY_LENGTH + 1), newPrices[coin]];
				});

				const newState = {
					prices: newPrices,
					history: newHistory,
					lastUpdate: Date.now(),
				};
				saveMarketState(newState);
				return newState;
			});
		};

		const interval = setInterval(updateMarket, PRICE_UPDATE_INTERVAL);
		return () => clearInterval(interval);
	}, []);

	// Handle cow walking - accumulate MooCoins
	const handleWalk = useCallback((deltaTime: number, cowX: number) => {
		microCoinsRef.current += deltaTime;
		if (microCoinsRef.current >= MICROCOIN_PER_COIN) {
			microCoinsRef.current -= MICROCOIN_PER_COIN;
			awardCoin(cowX);
		}

		// Save periodically (every 10 seconds)
		const now = Date.now();
		if (now - lastSaveRef.current > 10000) {
			lastSaveRef.current = now;
			saveMooCoins(mooCoins, microCoinsRef.current);
		}
	}, [awardCoin, mooCoins]);

	// Save on unmount
	useEffect(() => {
		return () => {
			saveMooCoins(mooCoins, microCoinsRef.current);
		};
	}, [mooCoins]);

	// Calculate progress to next coin (0-100%)
	const progressPercent = (microCoinsRef.current / MICROCOIN_PER_COIN) * 100;

	return (
		<>
			<RacetrackCow trackWidth={trackWidth} onWalk={handleWalk} />

			{/* MooCoin counter */}
			<div className="mooCoinCounterWrapper">
				<div
					className="mooCoinCounter"
					title="Right-click to copy/load wallet"
					onContextMenu={handleWalletContextMenu}
				>
					<div className="mooCoinProgress" style={{ width: `${progressPercent}%` }} />
					<span className="mooCoinIcon">🪙</span>
					<span className="mooCoinCount">{mooCoins}</span>
					<span className="mooCoinLabel">MooCoins</span>
					{walletToast && <span className="walletToast">{walletToast}</span>}
				</div>

				{/* Market panel */}
				<div className={`marketPanel ${marketExpanded ? 'expanded' : ''}`}>
					<div className="marketHeader" onClick={(e) => { e.stopPropagation(); setMarketExpanded(!marketExpanded); }}>
						<span className="marketTitle">📈 MooMarket</span>
						<span className="portfolioValue">Portfolio: {portfolioValue.toFixed(2)} 🪙</span>
					</div>

					{(Object.keys(COIN_CONFIG) as Array<keyof typeof COIN_CONFIG>).map(coin => {
						const config = COIN_CONFIG[coin];
						const price = market.prices[coin];
						const change = getPriceChange(coin);
						const holdings = investments[coin];
						const canBuy = mooCoins >= price;
						const canSell = holdings > 0;

						return (
							<div key={coin} className="marketRow">
								<div className="coinInfo">
									<span className="coinIcon">{config.icon}</span>
									<div className="coinDetails">
										<span className="coinTicker">{config.ticker}</span>
										<span className="coinName">{config.name}</span>
									</div>
								</div>
								<div className="priceInfo">
									<span className="coinPrice">{price.toFixed(2)} 🪙</span>
									<span className={`priceChange ${change >= 0 ? 'up' : 'down'}`}>
										{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
									</span>
								</div>
								<div className="holdingsInfo">
									<span className="holdingsLabel">Own:</span>
									<span className="holdingsCount">{holdings}</span>
								</div>
								<div className="tradeButtons">
									<button
										className="buyButton"
										onClick={(e) => { e.stopPropagation(); buyCoin(coin); }}
										disabled={!canBuy}
										title={`Buy 1 ${config.ticker} for ${price.toFixed(2)} MooCoins`}
									>BUY</button>
									<button
										className="sellButton"
										onClick={(e) => { e.stopPropagation(); sellCoin(coin); }}
										disabled={!canSell}
										title={`Sell 1 ${config.ticker} for ${price.toFixed(2)} MooCoins`}
									>SELL</button>
								</div>
							</div>
						);
					})}

					<div className="marketFooter">
						<span className="marketTip">Prices update every 5s</span>
					</div>
				</div>
			</div>

			{/* Floating +1 coins */}
			{floatingCoins.map(coin => (
				<div
					key={coin.id}
					className="floatingCoin"
					style={{ left: `${(coin.x / trackWidth) * 100}%` }}
				>
					+1 🪙
				</div>
			))}

			{/* Confetti */}
			{confetti.map(p => (
				<div
					key={p.id}
					className="mooCoinConfetti"
					style={{
						left: `${(p.x / trackWidth) * 100}%`,
						top: `${p.y}px`,
						backgroundColor: p.color,
						transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
					}}
				/>
			))}
		</>
	);
}
