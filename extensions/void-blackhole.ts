/**
 * void-blackhole — the animated ASCII black hole from ~/Developer/void,
 * ported to pi's TUI.
 *
 * Runs automatically as a splash on pi startup (any key dismisses), and
 * stays available as /void: a supermassive black hole with a gravity-driven
 * accretion disk. Every particle free-falls under Newtonian gravity, whirls
 * faster as angular momentum hauls it in, heats up (brighter glyph), vanishes
 * at the event horizon, and is re-fed from the rim — the whole galaxy forever
 * spiralling into the core. A bright photon ring hugs the shadow's edge.
 *
 * Relativistic garnish, all driven by the live particles:
 *   - gravitational lensing: matter near the hole casts a bent secondary
 *     image that arcs over the top of the shadow (and faintly beneath it)
 *   - Doppler beaming that strengthens as orbital speed climbs near the hole
 *   - gravitational redshift: the final plunge fades into the shadow
 *   - a photon ring that shimmers in time and glows on the approaching side
 *
 * Around it all, the galactic disk itself: the site's two-armed spiral dust
 * field (a port of buildDustField() from galaxy.js), rejection-sampled from
 * the same density model — core bulge, pronounced winding arms with clumps,
 * clean inter-arm voids — slowly wheeling around the hole.
 *
 * ASCII foremost: glyph density carries the shading (dim punctuation at the
 * cold rim, dense letters and digits at the hot core); color is only a
 * whisper of dim/bold so it reads on any theme.
 *
 * Physics + constants are a direct port of void/js/blackhole.js + config.js.
 *
 * The galaxy is populated with the rest of the void system, ported from
 * void/js/planets.js, events.js and starfield.js:
 *   - orbiting planets riding the disk at their own Keplerian rates
 *   - several comets on criss-crossing eccentric orbits, tails always
 *     streaming away from the core, longest and brightest at perihelion
 *   - constellations pinned to the far background: recognizable star
 *     patterns joined by faint dotted lines, twinkling slowly
 *   - shooting stars streaking across the field every so often
 *   - the occasional supernova: a star swells up the glyph ramp, flashes,
 *     and fades back to nothing
 *   - deep space beyond the stars: tiny, extremely dim two-arm glyph
 *     spirals slowly wheeling in the far background
 * The art also expands to fill the terminal instead of a fixed 76-col box.
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

// ------------------------------------------------ constants (config.js) ----
const EVENT_HORIZON = 0.85; // matter vanishes inside this radius (the shadow)
const DISK_INNER = 1.0; //    hot, bright inner rim of the disk
const SPAWN_OUTER = 6.0; //   matter is vacuumed in from across the whole galaxy
const DISK_COUNT = 1700; // dense enough to fill the full-terminal canvas
const GM = 2.2; //            gravitational pull
const ANG_MOMENTUM = 0.65; // higher = more spiral winding before the plunge
const INFLOW = 0.2; //        baseline inward glide
const DISK_SPAN = SPAWN_OUTER - DISK_INNER;
const TILT = Math.PI / 5.5; // systemTilt.rotation.x from main.js
const SIN_T = Math.sin(TILT);
const COS_T = Math.cos(TILT);
// Spiral dust field (config.js + galaxy.js).
const NUM_ARMS = 2; //        numArms
const ARM_TIGHTNESS = 2.3; // armTightness — opened up from the site's 3.4:
//                            at terminal resolution tightly-wound arms blur
//                            into plain texture; ~1.15 turns keeps a clear S
const DUST_INNER = 1.5;
const DUST_OUTER = 6.2;
const DUST_COUNT = 2400;
const DUST_SPIN = 0.2; //     rad/s — matches RING_SPIN from main.js

const LENS_OUT = 2.8; // matter inside this radius casts a lensed image
const LENS_R = 1.62; //  lensed arc radius, in event-horizon units (the
//                       photon ring's outer edge sits at sqrt(1.55) ~ 1.24,
//                       so the arc clears it by a full cell and reads as a
//                       separate halo even at terminal resolution)
const TICK_MS = 50; // 20 fps — plenty for glyphs
const FEED_GRAVITY = 3.2; // feed multiplier while space is held
const ART_MAX_W = 280; // wide: fill the terminal, centered, landing-page scale
const ART_MAX_ROWS = 64;
const SPLASH_TIMEOUT_MS = 9000;

// Orbiting planets (planets.js PLANET_DEFS, nav words dropped) — irregular
// radii, phases and heights so the orbital layer reads as a natural system.
// Each rides its own Keplerian rate, so the system slowly shears.
const PLANETS = [
	{ r: 3.6, a: 0.35, h: 0.45, ch: "O", b: 0.85, halo: true },
	{ r: 4.6, a: 1.55, h: -0.3, ch: "o", b: 0.6, halo: false },
	{ r: 4.2, a: 2.8, h: 0.15, ch: "0", b: 0.9, halo: true },
	{ r: 5.2, a: 4.05, h: -0.5, ch: "o", b: 0.65, halo: false },
	{ r: 4.0, a: 5.3, h: 0.3, ch: "o", b: 0.5, halo: false },
] as const;

// Comets (events.js makeComet): conic-section orbits integrated by
// conservation of angular momentum — r = P / (1 + E·cosθ), θ' = L / r².
// Several of them, each with its own eccentricity, size and orbit
// orientation (w, the argument of perihelion) so the ellipses criss-cross:
// perihelion dips through the planets, aphelion swings past the dust rim.
interface CometDef {
	e: number;
	p: number;
	l: number;
	w: number;
}
const COMET_DEFS: CometDef[] = [
	{ e: 0.65, p: 3.5, l: 2.4, w: 0 },
	{ e: 0.5, p: 4.4, l: 2.0, w: 2.3 },
	{ e: 0.78, p: 2.9, l: 2.7, w: 4.2 },
];
const COMET_TAIL = 10;
const COMET_TAIL_CHARS = "+=~;:-,.";

// Constellations: recognizable star patterns pinned to the far background —
// bright twinkling stars joined by faint dotted lines. Star coordinates in
// the unit square; placed in the frame's quiet regions away from the hole.
interface Constellation {
	nx: number; // normalized center
	ny: number;
	w: number; //  width as a fraction of the frame
	stars: Array<[number, number]>;
	edges: Array<[number, number]>;
}
const CONSTELLATIONS: Constellation[] = [
	{
		// Big Dipper
		nx: 0.3,
		ny: 0.13,
		w: 0.16,
		stars: [
			[0, 0.3],
			[0.18, 0.18],
			[0.38, 0.2],
			[0.54, 0.3],
			[0.6, 0.62],
			[0.86, 0.66],
			[0.98, 0.34],
		],
		edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
	},
	{
		// Cassiopeia
		nx: 0.72,
		ny: 0.88,
		w: 0.13,
		stars: [
			[0, 0.62],
			[0.24, 0.1],
			[0.5, 0.5],
			[0.76, 0.05],
			[1, 0.42],
		],
		edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
	},
	{
		// Orion
		nx: 0.07,
		ny: 0.55,
		w: 0.1,
		stars: [
			[0.2, 0],
			[0.8, 0.06],
			[0.38, 0.42],
			[0.5, 0.5],
			[0.62, 0.58],
			[0.12, 0.95],
			[0.9, 1],
		],
		edges: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
	},
];

// Transient events (events.js): shorter intervals than the site — a TUI
// session should actually get to see one.
const SHOOT_MIN = 10; //  seconds between shooting stars
const SHOOT_MAX = 25;
const SHOOT_DUR = 1.4; // seconds
const SHOOT_LEN = 0.55; // streak length, fraction of the frame
const SHOOT_CHARS = "*+=;:."; // bright head, dimming trail
const NOVA_MIN = 30; //   seconds between supernovae
const NOVA_MAX = 90;
const NOVA_DUR = 2.5;

// Deep space (starfield.js buildDeepSpace): tiny prebuilt two-arm glyph
// spirals, extremely dim, far behind everything.
interface DeepGalaxy {
	nx: number; //  normalized screen position
	ny: number;
	rotSpeed: number;
	pts: Array<{ rr: number; th: number; b: number }>;
}

function makeDeepGalaxies(): DeepGalaxy[] {
	const centers: Array<[number, number]> = [
		[0.13, 0.2],
		[0.86, 0.78],
		[0.82, 0.14],
		[0.16, 0.8],
	];
	return centers.map(([nx, ny]) => {
		const count = 12 + Math.floor(Math.random() * 12);
		const pts: DeepGalaxy["pts"] = [];
		for (let i = 0; i < count; i++) {
			const arm = i % 2;
			const u = i / count;
			const rr = 0.3 + u * 2.1;
			const th = rr * 1.9 + arm * Math.PI + (Math.random() - 0.5) * 0.5;
			pts.push({ rr, th, b: 0.04 + Math.random() * 0.06 });
		}
		return {
			nx: nx + (Math.random() - 0.5) * 0.06,
			ny: ny + (Math.random() - 0.5) * 0.06,
			rotSpeed: (Math.random() - 0.5) * 0.06,
			pts,
		};
	});
}

// charSet from config.js, pre-sorted dim -> bright by ink density —
// the terminal equivalent of buildBrightnessRamp() in glyphs.js.
const RAMP = ".,-~:;=i1ljrtcvzxsunyfoeahkpqdbg2354679w08m";
const RAMP_MAX = RAMP.length - 1;

const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ------------------------------------------------------------ component ----
class BlackHoleComponent {
	private tui: { requestRender: () => void };
	private onClose: () => void;
	private splash: boolean;
	private interval: ReturnType<typeof setInterval> | null = null;
	private timeout: ReturnType<typeof setTimeout> | null = null;

	// Per-particle state (polar position, radial velocity, angular momentum).
	private diskR = new Float32Array(DISK_COUNT);
	private diskVr = new Float32Array(DISK_COUNT);
	private diskTheta = new Float32Array(DISK_COUNT);
	private diskL = new Float32Array(DISK_COUNT);
	private diskYSeed = new Float32Array(DISK_COUNT);
	private diskNoise = new Float32Array(DISK_COUNT);

	// Press-and-hold SPACE to feed: gravity ramps up, eases back on release.
	private feedScale = 1;
	private feedUntil = 0;

	// Spiral-arm dust field, sampled once; the whole field wheels via spin.
	private dustR = new Float32Array(DUST_COUNT);
	private dustTheta = new Float32Array(DUST_COUNT);
	private dustY = new Float32Array(DUST_COUNT);
	private dustB = new Float32Array(DUST_COUNT);
	private dustCount = 0;
	private spin = 0;

	// Starfield, regenerated when the layout changes.
	private stars: Array<{ col: number; row: number; b: number; p: number }> = [];
	private starsKey = "";

	// Deep-space background galaxies (stable across resizes).
	private deepGalaxies = makeDeepGalaxies();

	// Comets + transient events (events.js state).
	private cometThetas = COMET_DEFS.map(() => Math.random() * Math.PI * 2);
	private shoot = { active: false, t: 0, x: 0, y: 0, dx: 0, dy: 0 };
	private shootTimer = 2 + Math.random() * 4; // first one early, for the splash
	private nova = { active: false, t: 0, x: 0, y: 0 };
	private novaTimer = NOVA_MIN * (0.5 + Math.random() * 0.5);

	private elapsed = 0;

	private version = 0;
	private cachedVersion = -1;
	private cachedWidth = 0;
	private cachedLines: string[] = [];
	private lastTime = Date.now();

	constructor(
		tui: { requestRender: () => void },
		onClose: () => void,
		splash: boolean,
	) {
		this.tui = tui;
		this.onClose = onClose;
		this.splash = splash;

		// Steady-state fill: seed along the infall paths so the disk is full.
		for (let i = 0; i < DISK_COUNT; i++) this.spawnDiskParticle(i, false);
		this.buildDustField();

		this.interval = setInterval(() => {
			const now = Date.now();
			const dt = Math.min(0.1, (now - this.lastTime) / 1000);
			this.lastTime = now;
			this.tick(dt);
			this.version++;
			this.tui.requestRender();
		}, TICK_MS);

		if (splash) {
			this.timeout = setTimeout(() => this.close(), SPLASH_TIMEOUT_MS);
		}
	}

	// Direct port of spawnDiskParticle() from blackhole.js — with a stronger
	// inward bias than the site (2.0 vs 1.2): at terminal resolution the
	// accretion disk must stay concentrated around the core, or its matter
	// fills the inter-arm voids and erases the spiral.
	private spawnDiskParticle(i: number, atEdge: boolean): void {
		const ra = DISK_INNER + Math.pow(Math.random(), 2.0) * DISK_SPAN;
		const L = ANG_MOMENTUM * Math.sqrt(GM * ra);
		this.diskL[i] = L;
		this.diskTheta[i] = Math.random() * Math.PI * 2;
		this.diskYSeed[i] = Math.random() + Math.random() - 1.0; // triangular
		this.diskNoise[i] = (Math.random() - 0.5) * 0.2;

		if (atEdge) {
			this.diskR[i] = ra;
			this.diskVr[i] = -INFLOW;
		} else {
			const E = (0.5 * L * L) / (ra * ra) - GM / ra;
			const r = EVENT_HORIZON + Math.random() * (ra - EVENT_HORIZON);
			this.diskR[i] = r;
			this.diskVr[i] =
				-INFLOW - Math.sqrt(Math.max(0, 2 * (E + GM / r) - (L * L) / (r * r)));
		}
	}

	// Direct port of buildDustField() from galaxy.js: rejection-sample the
	// two-armed spiral density field — minimal core bulge, highly pronounced
	// winding arms with clumps, clean inter-arm voids, fading at the rim.
	private buildDustField(): void {
		let placed = 0;
		let attempts = 0;
		while (placed < DUST_COUNT && attempts < DUST_COUNT * 100) {
			attempts++;

			// Area-proportional sampling prevents center crowding artifacts.
			const r2min = DUST_INNER * DUST_INNER;
			const r2max = DUST_OUTER * DUST_OUTER;
			const r = Math.sqrt(r2min + Math.random() * (r2max - r2min));
			const u = (r - DUST_INNER) / (DUST_OUTER - DUST_INNER);
			const theta = Math.random() * Math.PI * 2;

			const bulge = Math.exp(-3.5 * u) * 0.25;

			const winding = theta - u * ARM_TIGHTNESS * Math.PI;
			const turbulence = 0.08 * Math.sin(r * 4.0 + theta);
			const armBase = (Math.cos(NUM_ARMS * winding + turbulence) + 1) / 2;
			// Sharper than the site's 5.5 — coarse cells need crisper lanes.
			const armProfile = Math.pow(armBase, 7.0);
			const armClumps = 0.7 + 0.3 * Math.sin(u * 15.0 + theta * 2.0);
			const arm = armProfile * armClumps * 1.3 * (1.0 - u * 0.2);

			const ambient = 0.02 * (1.0 - u);

			const density = Math.max(
				0,
				(bulge + arm + ambient) * smoothstep(1.0, 0.85, u),
			);
			if (Math.random() > density) continue;

			this.dustR[placed] = r;
			this.dustTheta[placed] = theta;

			// 3D thickness envelope: puffy bulge, thin arms.
			const bulgeHeight = 0.3 * Math.exp(-4.0 * u);
			const armHeight = 0.05 + u * 0.08;
			this.dustY[placed] =
				Math.max(armHeight, bulgeHeight) *
				(Math.random() + Math.random() - 1.0) *
				0.5;

			const noise =
				(Math.random() + Math.random() + Math.random() - 1.5) * 0.15;
			this.dustB[placed] = Math.max(
				0,
				Math.min(1, Math.sqrt(density) + noise),
			);
			placed++;
		}
		this.dustCount = placed;
	}

	// Direct port of updateAccretionDisk() physics from blackhole.js.
	private tick(dt: number): void {
		this.elapsed += dt;
		this.spin += DUST_SPIN * dt; // the dust field wheels like ringSpin
		const feedTarget = Date.now() < this.feedUntil ? FEED_GRAVITY : 1;
		this.feedScale += (feedTarget - this.feedScale) * (1 - Math.exp(-3.5 * dt));

		for (let i = 0; i < DISK_COUNT; i++) {
			let r = this.diskR[i];
			// Newtonian free-fall: gravity accelerates matter inward while
			// angular momentum makes it whirl ever faster.
			const vr = this.diskVr[i] - ((GM * this.feedScale) / (r * r)) * dt;
			r += vr * dt;
			const theta = this.diskTheta[i] - (this.diskL[i] / (r * r)) * dt;

			if (r <= EVENT_HORIZON) {
				this.spawnDiskParticle(i, true); // consumed — re-fed from the rim
				continue;
			}
			this.diskR[i] = r;
			this.diskVr[i] = vr;
			this.diskTheta[i] = theta;
		}

		// Comets: each swings along its conic, fastest at perihelion.
		for (let i = 0; i < COMET_DEFS.length; i++) {
			const d = COMET_DEFS[i];
			const rc = d.p / (1 + d.e * Math.cos(this.cometThetas[i]));
			this.cometThetas[i] += (d.l / (rc * rc)) * dt;
		}

		// Shooting star: a straight streak across the frame, started on a
		// random timer (events.js, intervals shortened for the terminal).
		this.shootTimer -= dt;
		if (this.shootTimer <= 0 && !this.shoot.active) {
			const ang = Math.random() * Math.PI * 2;
			const dx = Math.cos(ang);
			const dy = Math.sin(ang);
			this.shoot = {
				active: true,
				t: 0,
				// Center the streak on a random on-screen point.
				x: 0.2 + Math.random() * 0.6 - (dx * SHOOT_LEN) / 2,
				y: 0.2 + Math.random() * 0.6 - (dy * SHOOT_LEN) / 2,
				dx,
				dy,
			};
			this.shootTimer = SHOOT_MIN + Math.random() * (SHOOT_MAX - SHOOT_MIN);
		}
		if (this.shoot.active) {
			this.shoot.t += dt;
			if (this.shoot.t >= SHOOT_DUR) this.shoot.active = false;
		}

		// Supernova: pick a field star away from the hole and let it go.
		this.novaTimer -= dt;
		if (this.novaTimer <= 0 && !this.nova.active) {
			let nx = 0.5;
			let ny = 0.5;
			for (let tries = 0; tries < 12; tries++) {
				nx = 0.1 + Math.random() * 0.8;
				ny = 0.1 + Math.random() * 0.8;
				if (Math.hypot(nx - 0.5, ny - 0.5) > 0.25) break;
			}
			this.nova = { active: true, t: 0, x: nx, y: ny };
			this.novaTimer = NOVA_MIN + Math.random() * (NOVA_MAX - NOVA_MIN);
		}
		if (this.nova.active) {
			this.nova.t += dt;
			if (this.nova.t >= NOVA_DUR) this.nova.active = false;
		}
	}

	private close(): void {
		this.dispose();
		this.onClose();
	}

	handleInput(data: string): void {
		// Any key — splash or /galaxy — collapses the view back into the editor.
		this.close();
	}

	invalidate(): void {
		this.cachedWidth = 0;
	}

	render(width: number): string[] {
		if (width === this.cachedWidth && this.cachedVersion === this.version) {
			return this.cachedLines;
		}

		// Expanded art: fill the terminal (leaving room for the
		// the editor below), centered.
		const artW = Math.max(30, Math.min(ART_MAX_W, width - 2));
		const termRows = process.stdout.rows ?? 24;
		const rows = Math.max(
			10,
			Math.min(ART_MAX_ROWS, Math.max(14, termRows - 8), Math.round(artW * 0.24)),
		);
		const offset = " ".repeat(Math.max(0, Math.floor((width - artW) / 2)));
		const cx = artW / 2;
		const cy = rows / 2;

		// Terminal cells are ~2:1 tall, so one world unit spans twice as many
		// columns as rows for an undistorted disk.
		const sY = Math.min(
			(rows - 1) / (2 * DUST_OUTER * SIN_T + 0.5),
			(artW - 2) / (4 * DUST_OUTER),
		);
		const sX = 2 * sY;

		// Brightness buffer. The disk composites additively so glyph density
		// itself carries the shading — overlapping faint matter builds up to
		// denser characters, pure ASCII tone.
		const bright = new Float32Array(artW * rows).fill(-1);
		const deposit = (col: number, row: number, b: number) => {
			if (col < 0 || col >= artW || row < 0 || row >= rows) return;
			const idx = row * artW + col;
			bright[idx] = bright[idx] < 0 ? b : Math.min(1, bright[idx] + b * 0.45);
		};
		const stamp = (col: number, row: number, b: number) => {
			if (col < 0 || col >= artW || row < 0 || row >= rows) return;
			const idx = row * artW + col;
			if (b > bright[idx]) bright[idx] = b;
		};
		// Exact-glyph overlay: planets, the comet and transient events keep
		// their own characters instead of the density ramp.
		const overlay: Array<string | null> = new Array(artW * rows).fill(null);
		const glyph = (col: number, row: number, ch: string, b: number) => {
			if (col < 0 || col >= artW || row < 0 || row >= rows) return;
			const idx = row * artW + col;
			overlay[idx] = ch;
			if (b > bright[idx]) bright[idx] = b;
		};

		// -- deep space: distant two-arm glyph spirals, dimmer than the
		// starfield, slowly wheeling over the minutes --
		const gs = Math.max(1.2, artW / 46);
		for (const g of this.deepGalaxies) {
			const rot = this.elapsed * g.rotSpeed;
			const gx = g.nx * artW;
			const gy = g.ny * rows;
			for (const p of g.pts) {
				stamp(
					Math.round(gx + Math.cos(p.th + rot) * p.rr * gs),
					Math.round(gy + Math.sin(p.th + rot) * p.rr * gs * 0.5),
					p.b,
				);
			}
		}

		// -- constellations: bright star patterns joined by faint dotted
		// lines, pinned to the background alongside the deep galaxies --
		for (const c of CONSTELLATIONS) {
			const cw = c.w * artW;
			const px = (s: [number, number]) => c.nx * artW + (s[0] - 0.5) * cw;
			const py = (s: [number, number]) =>
				c.ny * rows + (s[1] - 0.5) * cw * 0.5;
			for (const [a, b] of c.edges) {
				const x0 = px(c.stars[a]);
				const y0 = py(c.stars[a]);
				const x1 = px(c.stars[b]);
				const y1 = py(c.stars[b]);
				const steps = Math.max(
					2,
					Math.round(Math.hypot(x1 - x0, (y1 - y0) * 2)),
				);
				// Dotted: every other cell, ends left clear for the stars.
				for (let s = 1; s < steps; s += 2) {
					const u = s / steps;
					stamp(
						Math.round(x0 + (x1 - x0) * u),
						Math.round(y0 + (y1 - y0) * u),
						0.05,
					);
				}
			}
			for (let i = 0; i < c.stars.length; i++) {
				const tw =
					0.75 + 0.25 * Math.sin(this.elapsed * 1.3 + i * 2.1 + c.nx * 9);
				glyph(
					Math.round(px(c.stars[i])),
					Math.round(py(c.stars[i])),
					"*",
					0.4 * tw,
				);
			}
		}

		// -- starfield (dim, behind everything, blocked by the shadow) --
		const key = `${artW}x${rows}`;
		if (this.starsKey !== key) {
			this.starsKey = key;
			this.stars = [];
			const n = Math.floor((artW * rows) / 28);
			for (let i = 0; i < n; i++) {
				this.stars.push({
					col: Math.floor(Math.random() * artW),
					row: Math.floor(Math.random() * rows),
					b: 0.02 + Math.random() * 0.1,
					p: Math.random() * Math.PI * 2,
				});
			}
		}
		const holeRx = EVENT_HORIZON * sX;
		const holeRy = EVENT_HORIZON * sY;
		for (const s of this.stars) {
			const dx = (s.col - cx) / holeRx;
			const dy = (s.row - cy) / holeRy;
			if (dx * dx + dy * dy < 1.2) continue; // swallowed by the shadow
			// Slow twinkle, staggered per star.
			const tw = 0.7 + 0.3 * Math.sin(this.elapsed * 1.7 + s.p);
			stamp(s.col, s.row, s.b * tw);
		}

		// -- spiral-arm dust, wheeling behind the accretion disk. Stamped
		// (max), not deposited (additive): dust is dim texture and must never
		// out-glow the disk, and the inter-arm voids stay genuinely dark. On
		// small art every other mote is skipped so the arms stay airy. --
		const stride = artW >= 56 ? 1 : 2;
		for (let i = 0; i < this.dustCount; i += stride) {
			const r = this.dustR[i];
			const theta = this.dustTheta[i] - this.spin;
			const x = Math.cos(theta) * r;
			const z = Math.sin(theta) * r;
			const projY = z * SIN_T - this.dustY[i] * COS_T;
			stamp(
				Math.round(cx + x * sX),
				Math.round(cy + projY * sY),
				this.dustB[i] * 0.55,
			);
		}

		// -- accretion disk --
		for (let i = 0; i < DISK_COUNT; i++) {
			const r = this.diskR[i];
			const theta = this.diskTheta[i];
			const u = Math.max(0, Math.min(1, (r - DISK_INNER) / DISK_SPAN));

			const x = Math.cos(theta) * r;
			const z = Math.sin(theta) * r;
			// Thin galactic disk, a touch puffier toward the rim.
			const thickness = 0.05 + 0.1 * u;
			const y = this.diskYSeed[i] * thickness;

			// Tilt the system (rotation about x), camera looks along z.
			const projY = z * SIN_T - y * COS_T;

			// Hottest at the inner rim. Doppler beaming brightens the
			// approaching side, and strengthens as orbital speed climbs
			// toward the hole; gravitational redshift dims the last stretch
			// of the plunge so matter fades into the shadow instead of
			// burning brightest at the moment it vanishes.
			const amp = Math.min(0.5, 0.18 + 0.45 / r);
			const beaming = 1 - amp + amp * Math.cos(theta);
			const rs = Math.max(
				0,
				Math.min(1, (r - EVENT_HORIZON) / (DISK_INNER - EVENT_HORIZON)),
			);
			let b = Math.pow(1 - u, 0.7) * beaming + this.diskNoise[i];
			b = Math.max(0, Math.min(1, b)) * (0.35 + 0.65 * Math.sqrt(rs));

			// Gravitational lensing: matter near the hole also casts a bent
			// secondary image hugging a ring just outside the photon ring —
			// the far side arcs over the top of the shadow, the near side
			// glows faintly beneath it. Driven by the live particles, so the
			// arcs churn and flare with the disk itself.
			if (r < LENS_OUT) {
				const fade = 1 - (r - EVENT_HORIZON) / (LENS_OUT - EVENT_HORIZON);
				const t = (x * sX) / (holeRx * LENS_R);
				if (t > -1 && t < 1) {
					const dyArc = holeRy * LENS_R * Math.sqrt(1 - t * t);
					const colArc = Math.round(cx + x * sX);
					if (z < 0) {
						deposit(colArc, Math.round(cy - dyArc), b * 0.6 * fade);
					} else {
						deposit(colArc, Math.round(cy + dyArc), b * 0.3 * fade);
					}
				}
			}

			deposit(Math.round(cx + x * sX), Math.round(cy + projY * sY), b * 0.85);
		}

		// -- planets: single-glyph bodies riding the disk at their own
		// Keplerian rates, tilted with the system like everything else --
		for (const p of PLANETS) {
			const omega = Math.sqrt(GM / (p.r * p.r * p.r));
			const theta = p.a - this.elapsed * omega;
			const px = Math.cos(theta) * p.r;
			const pz = Math.sin(theta) * p.r;
			const projY = pz * SIN_T - p.h * COS_T;
			const col = Math.round(cx + px * sX);
			const row = Math.round(cy + projY * sY);
			glyph(col, row, p.ch, p.b);
			if (p.halo) {
				// The bigger bodies glow a cell wide.
				deposit(col - 1, row, 0.16);
				deposit(col + 1, row, 0.16);
			}
		}

		// -- comets: bright heads, tails streaming anti-solar (away from the
		// core), longest and brightest near perihelion --
		for (let c = 0; c < COMET_DEFS.length; c++) {
			const def = COMET_DEFS[c];
			const th = this.cometThetas[c];
			const r = def.p / (1 + def.e * Math.cos(th));
			const ang = th + def.w; // whole orbit rotated in the disk plane
			const hx = Math.cos(ang) * r;
			const hz = Math.sin(ang) * r;
			const prox =
				1 - smoothstep(def.p / (1 + def.e), def.p / (1 - def.e), r);
			glyph(
				Math.round(cx + hx * sX),
				Math.round(cy + hz * SIN_T * sY),
				"*",
				0.45 + 0.55 * prox,
			);
			const rx = hx / r;
			const rz = hz / r;
			const spacing = 0.3 + 0.25 * prox;
			for (let i = 0; i < COMET_TAIL; i++) {
				const d = (i + 1) * spacing;
				const ch =
					COMET_TAIL_CHARS[
						Math.min(
							COMET_TAIL_CHARS.length - 1,
							Math.floor((i / COMET_TAIL) * COMET_TAIL_CHARS.length),
						)
					];
				glyph(
					Math.round(cx + (hx + rx * d) * sX),
					Math.round(cy + (hz + rz * d) * SIN_T * sY),
					ch,
					(0.12 + 0.88 * prox) * (1 - i / COMET_TAIL) * 0.7,
				);
			}
		}

		// -- shooting star: bright head, six dimming glyphs trailing --
		if (this.shoot.active) {
			const u = this.shoot.t / SHOOT_DUR;
			const env = Math.min(1, u / 0.15) * (1 - smoothstep(0.6, 1, u));
			const hx = this.shoot.x + this.shoot.dx * u * SHOOT_LEN;
			const hy = this.shoot.y + this.shoot.dy * u * SHOOT_LEN;
			for (let i = 0; i < SHOOT_CHARS.length; i++) {
				const d = i * 0.035;
				glyph(
					Math.round((hx - this.shoot.dx * d) * artW),
					Math.round((hy - this.shoot.dy * d) * rows),
					SHOOT_CHARS[i],
					env * (1 - i / SHOOT_CHARS.length),
				);
			}
		}

		// -- supernova: swell up the ramp to the flash, then fade back --
		if (this.nova.active) {
			const u = this.nova.t / NOVA_DUR;
			const stage = u < 0.12 ? 0 : u < 0.26 ? 1 : 2;
			const fade = 1 - smoothstep(0.5, 1, u);
			const col = Math.round(this.nova.x * artW);
			const row = Math.round(this.nova.y * rows);
			glyph(col, row, ".+*"[stage], Math.max(0.15, fade));
			if (stage === 2 && fade > 0.5) {
				// The flash spills into the neighbouring cells.
				deposit(col - 1, row, 0.25 * fade);
				deposit(col + 1, row, 0.25 * fade);
				deposit(col, row - 1, 0.18 * fade);
				deposit(col, row + 1, 0.18 * fade);
			}
		}

		// -- event horizon + photon ring, asserted in screen space: at
		// terminal resolution cell rounding would smear the inner rim across
		// the hole, so the shadow is carved as a solid dark ellipse and the
		// photon ring drawn as its bright, shimmering outline. --
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < artW; col++) {
				const dx = (col - cx) / holeRx;
				const dy = (row - cy) / holeRy;
				const d2 = dx * dx + dy * dy;
				if (d2 < 1.0) {
					bright[row * artW + col] = -1; // nothing escapes
					overlay[row * artW + col] = null; // not even the comet
				} else if (d2 < 1.55) {
					// Per-cell phase from a stable hash, animated slowly in time
					// so the ring shimmers instead of sitting frozen — and the
					// approaching (Doppler) side glows a touch hotter, matching
					// the disk's bright side.
					const h = (((col * 73856093) ^ (row * 19349663)) >>> 0) % 97;
					const tw =
						0.5 + 0.5 * Math.sin(this.elapsed * 2.1 + (h / 97) * Math.PI * 2);
					const doppler = 0.9 + 0.1 * (dx / Math.sqrt(d2));
					stamp(col, row, (0.84 + 0.16 * tw) * doppler);
				}
			}
		}

		// -- rasterize: brightness -> glyph; color is just dim/normal/bold --
		const lines: string[] = [""];
		for (let row = 0; row < rows; row++) {
			let line = offset;
			let tier = ""; // "" | DIM | BOLD
			for (let col = 0; col < artW; col++) {
				const b = bright[row * artW + col];
				if (b < 0) {
					line += " ";
					continue;
				}
				const ch =
					overlay[row * artW + col] ??
					RAMP[Math.min(RAMP_MAX, Math.floor(Math.pow(b, 0.85) * RAMP_MAX))];
				const want = b < 0.3 ? DIM : b < 0.8 ? "" : BOLD;
				if (want !== tier) {
					line += RESET + want;
					tier = want;
				}
				line += ch;
			}
			if (tier !== "") line += RESET;
			lines.push(line);
		}

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;
		return lines;
	}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}
}

// ------------------------------------------------------------- extension ----
export default function (pi: ExtensionAPI) {
	// Intro splash: the void greets you on startup. Any key dismisses,
	// or it collapses on its own after a few seconds.
	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup" || ctx.mode !== "tui") return;
		void ctx.ui.custom((tui, _theme, _kb, done) => {
			return new BlackHoleComponent(tui, () => done(undefined), true);
		});
	});

	pi.registerCommand("galaxy", {
		description:
			"The ASCII galaxy — black hole, planets, comets, constellations",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("The galaxy requires interactive mode", "error");
				return;
			}
			await ctx.ui.custom((tui, _theme, _kb, done) => {
				return new BlackHoleComponent(tui, () => done(undefined), false);
			});
		},
	});
}
