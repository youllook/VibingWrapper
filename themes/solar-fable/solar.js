/* themes/solar-fable — 太陽系・Fable (2026-11-10, real orbits)
   A time-lapse of the real solar system as one film frame: a locked-off camera above the ecliptic looks across the
   whole system toward the Sun while the nine planets run on their true orbits (JPL approximate Keplerian elements,
   starting from today's date; see helio()). Distances are log-compressed, sizes exaggerated, directions,
   eccentricities and inclinations real. Moons follow their planets; ring planes and spin axes stay fixed in space.
   Everything is one WebGL fragment shader (no textures, no libraries): analytic spheres (nearest hit wins) and rings,
   orbit lines from ray / orbital-plane intersections, 1-D zonal bands, procedural surfaces, per-planet light from the
   Sun, then a post pass (upscale, chromatic aberration, bloom, ACES, split toning, vignette, film grain).
   Claude's state is the Sun's weather and the speed of time (see STATES); 等你 is a total eclipse, time almost
   stops and a ring of light travels outward through the orbital plane. Each of the 5 session slots is a comet in the
   sky above the far side; its tail follows that session.
   Conventions (themes/README.md): state.json every second, events.json optional, window.wpPause,
   document.hidden, ?day=1 / ?night=1, window.theme for demo.html, ?debug=1 panel. Extras: ?cam=a|b|c (camera), ?speed= (days per second),
   ?date=YYYY-MM-DD (start date), ?lon= (ecliptic longitude facing the camera). */
'use strict';
const Q = new URLSearchParams(location.search);
const DEBUG = Q.get('debug') === '1';
if (DEBUG) document.body.classList.add('debug');

const CONFIG = {
  fullTransition: 6.0,          // seconds for a full-range parameter change (demo.html can change it)
  polling: true,
  fps: 30,
  scale: 0.46,                  // scene render scale (post pass runs at canvas size)
  clockHours: Q.has('day') ? 10.5 : Q.has('night') ? 22 : null,
  milkyWay: Q.has('mw') ? Math.max(0, +Q.get('mw') || 0) : 1.0,               // Milky Way brightness (?mw=0 turns it off)
  daysPerSecond: Q.has('speed') ? Math.max(0, +Q.get('speed') || 0) : 4.0,   // time-lapse: simulated days per real second (4 → Earth goes round in ~91 s); ?speed=
};
const PARAMS = {
  activity:   [0, 1],     // how fast the surface churns; prominences, active regions
  wind:       [0, 1],     // radial solar-wind streaks
  flare:      [0, 1],     // lens streak (kept faint: the camera is not flooded any more)
  haze:       [0, 1],     // dust veil drifting in front of the planets
  sunGain:    [0, 1.6],   // how hard the Sun burns
  eclipse:    [0, 1],     // 等你: the disc goes black, only the corona is left
  pulse:      [0, 1],     // 等你: a ring of light travels outward
  dust:       [0, 1],     // zodiacal dust along the ecliptic
  key:        [0, 1.5],   // sunlight on the planets
  aurora:     [0, 1],
  lightning:  [0, 1],     // Jupiter's night side
  turbulence: [0, 1],     // band edges on the gas giants
  warmth:     [-1, 1],    // colour grading: cool … warm
  shake:      [0, 1],
  zoom:       [0, 1],     // slow push-in
  flow:       [0, 3],     // how fast time runs (× CONFIG.daysPerSecond)
  exposure:   [0.4, 1.6],
};
const STATES = {
  clear:    { activity: 0.22, wind: 0.00, flare: 0.10, haze: 0.00, sunGain: 1.00, eclipse: 0, pulse: 0, dust: 0.35, key: 1.00, aurora: 0.10, lightning: 0.00, turbulence: 0.20, warmth: 0.10, shake: 0.05, zoom: 0.00, flow: 1.00, exposure: 0.92 },
  overcast: { activity: 0.03, wind: 0.00, flare: 0.03, haze: 1.00, sunGain: 0.62, eclipse: 0, pulse: 0, dust: 0.70, key: 0.70, aurora: 0.30, lightning: 0.10, turbulence: 0.80, warmth: -0.85, shake: 0.10, zoom: 0.35, flow: 0.50, exposure: 0.86 },
  storm:    { activity: 1.00, wind: 1.00, flare: 0.16, haze: 0.30, sunGain: 1.08, eclipse: 0, pulse: 0, dust: 0.45, key: 1.10, aurora: 1.00, lightning: 1.00, turbulence: 1.00, warmth: -0.15, shake: 0.60, zoom: 0.70, flow: 2.50, exposure: 0.94 },
  clearing: { activity: 0.38, wind: 0.10, flare: 0.55, haze: 0.20, sunGain: 1.15, eclipse: 0, pulse: 0, dust: 0.60, key: 1.15, aurora: 0.30, lightning: 0.00, turbulence: 0.35, warmth: 1.00, shake: 0.06, zoom: 0.15, flow: 1.20, exposure: 0.98 },
  waiting:  { activity: 0.12, wind: 0.00, flare: 0.00, haze: 0.00, sunGain: 0.80, eclipse: 1, pulse: 1, dust: 0.25, key: 0.22, aurora: 0.50, lightning: 0.00, turbulence: 0.20, warmth: -0.35, shake: 0.02, zoom: 0.00, flow: 0.03, exposure: 0.95 },
};
const KEYS = { '1': 'clear', '2': 'overcast', '3': 'storm', '4': 'clearing', '5': 'waiting' };
const CODE = { clear: 1, overcast: 2, storm: 3, clearing: 4, waiting: 5 };

/* ------------------------------ shaders ------------------------------ */
const VS = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FS_SCENE = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform vec2 uTanHalf;
#define NB 13
uniform vec4 uP[NB];            // centre, radius: 0 Mercury 1 Venus 2 Earth 3 Moon 4 Mars 5 Jupiter 6 Saturn 7 Uranus 8 Neptune 9 Pluto 10 Io 11 Europa 12 Titan
uniform vec3 uA[NB], uT[NB], uB[NB];   // spin axis and the two equatorial axes (uB at spin 0 faces the camera)
uniform vec4 uAtm[NB];          // atmosphere colour, scale height (fraction of radius, 0 = none); small moons: their colour
uniform vec3 uScr[NB];          // screen bound: x, y, radius (render pixels)
uniform vec3 uMwN, uMwC, uMwT;   // Milky Way: pole of the band, core direction, third axis
uniform float uMwGain;
uniform vec3 uSunPos;
uniform float uSunDist;         // camera → Sun
uniform vec4 uOrb[9];           // orbit: semi-latus rectum (AU), eccentricity, nearest and farthest display radius
uniform vec4 uOrbN[9];          // orbit plane normal, w = how far the orbit climbs out of the ecliptic (display units)
uniform vec3 uOrbP[9], uOrbD[9];// unit vectors Sun → perihelion and Sun → the planet right now
uniform vec4 uOrbF[9];          // distance scale around this orbit: ln(a), display radius at a, slope inside, slope outside
uniform vec3 uSunScr;           // x, y, radius in render pixels
uniform float uHaze, uSunPh;     // uSunPh: the surface's own clock (runs faster when the Sun is active)
uniform float uAct, uWind, uFlare, uSunGain, uEclipse, uPulse, uPulsePh, uDust, uKey, uAurora, uLightning, uTurb, uStarGain, uGrs;
uniform vec4 uComet[5];         // x, y (px), size, state code (0 = none)
uniform vec4 uCometB[5];        // phase, presence, activity, -

#define PI 3.14159265

float hash11(float n){ return fract(sin(n*127.1)*43758.5453); }
vec2  hash21(float n){ return fract(sin(vec2(n, n+1.0)*vec2(127.1,311.7))*43758.5453); }
vec3  hash33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float noise2(vec2 x){                              // half the price of noise3: used for everything that lives on the screen
  vec2 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
const mat3 ROT = mat3(0.00,0.80,0.60, -0.80,0.36,-0.48, -0.60,-0.48,0.64);
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a*noise3(p); p = ROT*p*2.07 + vec3(1.7,9.2,3.1); a *= 0.5; } return v/0.875; }
float fbm5(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*noise3(p); p = ROT*p*2.07 + vec3(1.7,9.2,3.1); a *= 0.5; } return v/0.96875; }
float belt(float l, float c, float w){ float x = (l-c)/w; return exp(-x*x); }

/* ---------- surfaces: q = (east, north, toward camera at spin 0), unit vector ---------- */
vec3 sMercury(vec3 q){
  float m = fbm5(q*3.2 + 4.0);
  vec3 c = mix(vec3(0.30,0.28,0.26), vec3(0.56,0.52,0.47), smoothstep(0.3, 0.7, m));
  float ray = smoothstep(0.80, 0.92, noise3(q*7.0 + 2.0));                    // a few fresh ray craters
  return c + vec3(0.25,0.24,0.22)*ray;
}
vec3 sVenus(vec3 q){
  float lat = q.y;
  float w = fbm3(vec3(q.x*1.4 + lat*lat*2.4 + uTime*0.01, lat*3.6, q.z*1.4));   // swept-back chevrons
  float f = noise3(vec3(q.x*5.0 + lat*lat*6.0, lat*11.0, q.z*5.0));
  return mix(vec3(0.74,0.58,0.34), vec3(0.98,0.90,0.72), smoothstep(0.25, 0.75, w*0.75 + f*0.25));
}
vec3 sEarth(vec3 q, out float ocean, out float cloud, out float land){
  float lat = q.y;
  float h = fbm5(q*1.55 + vec3(3.1, 0.7, 5.2)) + 0.10*noise3(q*0.9 + 8.0) - 0.05;
  land = smoothstep(0.515, 0.540, h);
  float dry = noise3(q*2.6 + 11.0);
  vec3 veg = mix(vec3(0.08,0.20,0.07), vec3(0.20,0.27,0.10), dry);
  vec3 sand = vec3(0.52,0.41,0.25);
  vec3 lc = mix(veg, sand, smoothstep(0.45, 0.70, dry + 0.5*belt(abs(lat), 0.30, 0.16) - 0.25));
  lc = mix(lc, vec3(0.36,0.31,0.26), smoothstep(0.62, 0.72, h));              // highlands
  vec3 sea = mix(vec3(0.010,0.045,0.16), vec3(0.03,0.16,0.33), smoothstep(0.42, 0.515, h));
  vec3 c = mix(sea, lc, land);
  float ice = smoothstep(0.80, 0.90, abs(lat) + 0.10*(h-0.5));
  c = mix(c, vec3(0.90,0.94,0.97), ice);
  vec3 cq = q + 0.22*vec3(noise3(q*2.3 + 1.0), noise3(q*2.3 + 5.0), noise3(q*2.3 + 9.0)) + vec3(uTime*0.004, 0.0, 0.0);
  float cl = fbm5(vec3(cq.x*2.6, cq.y*4.2, cq.z*2.6) + 2.0);
  cloud = smoothstep(0.50, 0.70, cl + 0.08*belt(lat, 0.0, 0.12) + 0.10*belt(abs(lat), 0.62, 0.15));
  ocean = (1.0 - land)*(1.0 - ice)*(1.0 - cloud);
  return mix(c, vec3(0.95,0.96,0.97), cloud*0.93);
}
vec3 sMoon(vec3 q){
  float m = fbm3(q*2.1 + 7.0);
  return mix(vec3(0.20,0.20,0.21), vec3(0.50,0.49,0.47), smoothstep(0.38, 0.62, m))*(0.85 + 0.3*noise3(q*9.0));
}
vec3 sMars(vec3 q){
  float lat = q.y;
  float m = fbm5(q*1.9 + vec3(6.0, 1.0, 2.0));
  vec3 c = mix(vec3(0.74,0.38,0.19), vec3(0.86,0.55,0.32), noise3(q*3.3 + 3.0));
  c = mix(c, vec3(0.27,0.15,0.11), smoothstep(0.52, 0.64, m)*0.85);            // dark basalt plains
  c *= 0.88 + 0.24*noise3(q*11.0);
  float cap = smoothstep(0.80, 0.86, lat + 0.05*(m-0.5)) + smoothstep(0.90, 0.94, -lat + 0.04*(m-0.5));
  return mix(c, vec3(0.95,0.93,0.90), clamp(cap, 0.0, 1.0));
}
vec3 sJupiter(vec3 q, out float spotOut){
  float lat = q.y;
  float lon = atan(q.x, q.z);
  float dl = lon - uGrs, dlat = lat + 0.37;
  float d2 = dl*dl/0.034 + dlat*dlat/0.0072;                                   // the Great Red Spot: an oval the belts flow around
  float spot = smoothstep(1.05, 0.50, d2);
  float lw = lat + dlat*exp(-d2*0.55)*0.55;
  vec3 wq = vec3(q.x*2.4, lw*5.0, q.z*2.4) + vec3(0.0, 0.0, uTime*0.006);
  float w = noise3(wq)*0.65 + noise3(wq*2.2 + 3.0)*0.35;
  lw += (w-0.5)*(0.014 + 0.050*uTurb);
  float ed = noise3(vec3(q.x*8.0 + uTime*0.02, lw*30.0, q.z*8.0));
  lw += (ed-0.5)*(0.012 + 0.018*uTurb);
  float ed2 = noise3(vec3(q.x*19.0 - uTime*0.015, lw*64.0, q.z*19.0))*0.7 + 0.3*ed;
  lw += (ed2-0.5)*0.014;
  float dark = 0.95*belt(lw, 0.215, 0.080) + 1.0*belt(lw, -0.235, 0.090) + 0.55*belt(lw, 0.50, 0.045) + 0.50*belt(lw, -0.55, 0.050)
             + 0.35*belt(lw, 0.70, 0.04) + 0.35*belt(lw, -0.74, 0.04);
  float fine = noise3(vec3(lw*46.0, 3.7, 1.1)) - 0.5;
  dark = clamp(dark + fine*0.42 + (ed2-0.5)*0.30*dark, 0.0, 1.0);
  vec3 zone = vec3(0.80,0.72,0.60), brown = vec3(0.36,0.17,0.10), tan_ = vec3(0.62,0.42,0.27);
  vec3 c = mix(zone, tan_, smoothstep(0.0, 0.45, dark));
  c = mix(c, brown, smoothstep(0.40, 0.95, dark));
  float streak = noise3(vec3(q.x*2.6, lw*80.0, q.z*2.6));
  c *= 0.84 + 0.32*streak;
  c = mix(c, vec3(0.46,0.42,0.40), smoothstep(0.66, 0.93, abs(lat))*0.75);     // grey-brown poles
  c = mix(c, zone*1.02, smoothstep(3.2, 1.0, d2)*(1.0-spot)*0.32);             // the pale hollow around the spot
  vec3 sc = mix(vec3(0.70,0.34,0.22), vec3(0.56,0.21,0.13), smoothstep(0.8, 0.0, d2));
  sc *= 0.82 + 0.36*noise3(vec3(dl*26.0, dlat*70.0, d2*2.5));
  c *= 1.0 - 0.08*belt(d2, 1.15, 0.30);
  c = mix(c, sc, spot);
  spotOut = spot;
  return c;
}
vec3 sSaturn(vec3 q){
  float lat = q.y;
  float lw = lat + (noise3(vec3(q.x*2.0, lat*5.0, q.z*2.0)) - 0.5)*(0.008 + 0.02*uTurb);
  float b = noise3(vec3(lw*9.0, 1.3, 7.7))*0.6 + noise3(vec3(lw*24.0, 5.1, 2.2))*0.4;
  vec3 c = mix(vec3(0.60,0.50,0.36), vec3(0.82,0.75,0.58), smoothstep(0.25, 0.75, b));
  c = mix(c, vec3(0.84,0.78,0.62), 0.5*belt(lw, 0.0, 0.10));
  c = mix(c, vec3(0.55,0.58,0.52), smoothstep(0.70, 0.95, abs(lat))*0.6);
  return c;
}
vec3 sUranus(vec3 q){
  float lat = q.y;
  float b = noise3(vec3(lat*6.0, 2.0, 4.0));
  vec3 c = mix(vec3(0.52,0.80,0.84), vec3(0.66,0.90,0.90), b);
  return mix(c, vec3(0.80,0.95,0.93), smoothstep(0.35, 0.95, lat)*0.5);          // bright polar hood
}
vec3 sNeptune(vec3 q){
  float lat = q.y; float lon = atan(q.x, q.z);
  float b = noise3(vec3(lat*8.0, 6.0, 1.0))*0.7 + noise3(vec3(lat*21.0, 2.0, 3.0))*0.3;
  vec3 c = mix(vec3(0.06,0.16,0.56), vec3(0.16,0.34,0.84), b);
  float dl = lon + 0.25, dlat = lat + 0.30;
  float d2 = dl*dl/0.05 + dlat*dlat/0.012;
  c = mix(c, vec3(0.03,0.07,0.30), smoothstep(1.0, 0.5, d2)*0.85);              // Great Dark Spot
  float cir = smoothstep(0.60, 0.85, noise3(vec3(q.x*2.5, lat*16.0, q.z*2.5)))*belt(lat, -0.10, 0.14);
  return mix(c, vec3(0.80,0.88,1.0), cir*0.55);
}
vec3 sPluto(vec3 q){
  float m = fbm5(q*2.4 + 9.0);
  vec3 c = mix(vec3(0.40,0.27,0.19), vec3(0.66,0.52,0.39), smoothstep(0.30, 0.70, m));
  c = mix(c, vec3(0.80,0.72,0.58), smoothstep(0.45, 0.85, q.y)*0.7);            // pale north
  float dk = belt(q.y, -0.34, 0.20)*smoothstep(0.42, 0.56, m + 0.25*smoothstep(0.1, -0.6, q.x));
  c = mix(c, vec3(0.20,0.11,0.08), dk*0.9);                                    // the dark equatorial belt (Cthulhu)
  c *= 0.90 + 0.20*noise3(q*14.0);
  // Tombaugh Regio: the heart, tilted a little, left lobe brighter
  vec2 h = vec2(q.x - 0.06, q.y + 0.02);
  h = vec2(h.x*0.966 - h.y*0.259, h.x*0.259 + h.y*0.966)/0.44;
  h.y -= 0.18;
  float hy = 1.15*h.y - 0.85*sqrt(abs(h.x) + 0.015);
  float f = (h.x*h.x + hy*hy - 1.0)*0.5;
  float hn = fbm3(q*7.0 + 3.0);
  float heart = smoothstep(0.07, -0.07, f + 0.26*(fbm3(q*3.4 + 5.0)-0.5) + 0.06*(hn-0.5))*step(0.0, q.z);
  vec3 hc = mix(vec3(0.90,0.85,0.77), vec3(0.76,0.67,0.56), smoothstep(-0.2, 0.6, h.x))*(0.86 + 0.26*hn);
  return mix(c, hc, heart*mix(0.96, 0.62, smoothstep(0.0, 0.8, h.x)));
}

/* ---------- rings ---------- */
float satCoarse(float r){                         // smooth profile, also the shadow on the globe
  return 0.22*smoothstep(1.24, 1.32, r)*smoothstep(1.56, 1.50, r) + 1.0*smoothstep(1.50, 1.58, r)*smoothstep(1.96, 1.93, r)
       + 0.62*smoothstep(2.04, 2.07, r)*smoothstep(2.29, 2.26, r);
}
float satDensity(float r, float fw){
  float fine = noise3(vec3(r*42.0, 1.3, 2.7))*0.6 + noise3(vec3(r*110.0, 5.1, 0.3))*0.4;
  fine = mix(smoothstep(0.2, 0.8, fine), 0.5, clamp(fw*40.0, 0.0, 1.0));       // fade detail the pixels cannot hold
  float mid = noise3(vec3(r*15.0, 4.0, 1.0))*0.6 + noise3(vec3(r*6.0, 9.0, 2.0))*0.4;
  float d = satCoarse(r)*(0.50 + 0.22*fine + 0.42*mid);
  d *= 1.0 - 0.85*smoothstep(0.014 + fw, 0.004, abs(r - 2.215));               // Encke gap
  return clamp(d, 0.0, 1.0);
}

/* ---------- sky ---------- */
/* The Milky Way: a band fixed in the sky (world space, so the time-lapse never moves it). uMwN is the pole of the
   band's great circle, uMwC the direction of the galactic core, uMwT the third axis. Soft glow, clumpy star clouds,
   a dark dust rift down the middle, a warmer and wider core — kept low-contrast so it stays behind the picture. */
vec3 milkyWay(vec3 rd, vec2 frag){
  float b = dot(rd, uMwN);
  if (abs(b) > 0.42) return vec3(0.0);
  float u = dot(rd, uMwT), v = dot(rd, uMwC);
  float core = smoothstep(0.80, 0.995, v);                                      // 1 toward the galactic centre
  float w = 0.130 + 0.110*core;
  float base = exp(-b*b/(w*w));
  if (base < 0.012) return vec3(0.0);
  vec2 p = vec2(u, b);
  float warp = noise2(p*2.3 + 5.0);
  float c1 = noise2(p*4.6 + vec2(1.7, 9.2) + warp*0.9), c2 = noise2(p*11.0 + vec2(4.0, 2.0) + c1*0.7);
  float clouds = c1*0.60 + c2*0.40;                                             // mottled star clouds
  float lane = b - 0.060*(warp - 0.5) - 0.010;                                  // the Great Rift wanders about the mid-line
  float lw = 0.020 + 0.048*c1;
  float rift = exp(-lane*lane/(lw*lw))*smoothstep(0.20, 0.60, 1.0 - c2*0.7 - warp*0.3);
  rift = max(rift, 0.70*smoothstep(0.58, 0.78, c2)*smoothstep(0.50, 0.30, c1));  // scattered dark clouds off the mid-line
  float glow = base*(0.42 + 0.80*clouds)*(0.95 + 0.95*core)*(1.0 - 0.78*rift);
  vec3 tint = mix(vec3(0.46,0.56,0.80), vec3(0.98,0.80,0.60), core*(0.45 + 0.55*clouds));
  tint = mix(tint, vec3(0.75,0.52,0.40), 0.35*rift);                             // dust reddens what shines through it
  vec3 c = tint*glow*0.21;
  c += mix(vec3(0.78,0.84,1.0), vec3(1.0,0.90,0.76), core)*step(0.990, hash12(frag))*glow*0.22;   // unresolved stars: a fine sparkle
  return c;
}
vec3 stars(vec3 rd, float pix){
  float sc = 46.0;
  vec3 cell = floor(rd*sc); vec3 h = hash33(cell);
  vec3 sp = normalize((cell + 0.2 + 0.6*h)/sc);
  float d = length(rd - sp); float sig = pix*0.62;
  float bright = step(0.90, h.x)*pow(h.y, 6.0);
  float tw = 1.0 + 0.25*sin(uTime*(1.5 + h.z*3.0) + h.z*40.0);
  vec3 tint = mix(vec3(1.0,0.80,0.62), vec3(0.72,0.82,1.0), h.z);
  return tint*exp(-d*d/(2.0*sig*sig))*bright*2.6*tw;
}

/* ---------- the Sun (screen space, d in units of frame height) ---------- */
/* A ball of fire, not a blown-out disc: convection cells that slowly churn, limb darkening toward deep red, a few
   spots, prominences along the limb and only a thin corona. Exposed like a filtered telescope shot, so the planets
   beside it stay readable; the light it throws on them is unchanged. */
vec3 fireRamp(float h){
  vec3 c = mix(vec3(0.42,0.045,0.008), vec3(0.95,0.26,0.035), smoothstep(0.08, 0.50, h));
  c = mix(c, vec3(1.0,0.60,0.16), smoothstep(0.45, 0.85, h));
  return mix(c, vec3(1.0,0.86,0.52), smoothstep(0.85, 1.25, h));
}
vec4 sunLayer(vec2 d, float r){                    // rgb = light to add, a = how much of the background the disc hides
  float rs = uSunScr.z/uRes.y; float x = r/rs;
  float breathe = 1.0 + uEclipse*0.25*sin(uTime*1.6);
  float aa = 1.2/uSunScr.z;
  vec2 an = d/max(r, 1e-5);
  float ph = uSunPh;
  float lick = noise2(an*11.0 + vec2(ph*0.33, -ph*0.21));                         // fast, small: the limb flickers
  float xe = x - (lick - 0.5)*0.016*(1.0 - uEclipse);
  float disc = smoothstep(1.0 + aa, 1.0 - aa, xe);
  float o = max(x - 1.0, 0.0);
  vec3 warm = vec3(1.0,0.52,0.20);
  vec3 c = warm*(0.0011/(r*r + 0.0040))*uSunGain*(1.0 - uEclipse);                      // a little scatter, no white fog
  if (x < 1.07) {
    // surface: look at a sphere, not a plate — the pattern is squeezed toward the limb
    float z = sqrt(max(1.0 - x*x, 0.0));
    vec2 q = (d/rs)/(1.0 + z)*7.0;
    vec2 qr = vec2(q.x*0.8 - q.y*0.6, q.x*0.6 + q.y*0.8);                        // rotated copy: keeps the noise lattice off the disc's own axes
    float big = noise2(qr*0.55 + vec2(0.37 + ph*0.010, 0.61 - ph*0.006));
    // Boiling convection. A slowly turning flow field carries the cells; two copies of the pattern run half a cycle
    // apart and cross-fade, so plasma keeps welling up, sliding along the flow, splitting and sinking without ever
    // drifting off the disc or snapping back. No hard thresholds (those made blocky cells and a face).
    vec2 flow = vec2(noise2(q*0.85 + vec2(1.3, ph*0.045)), noise2(q*0.85 + vec2(6.1 - ph*0.038, 2.7))) - 0.5;
    flow += 0.35*vec2(-q.y, q.x)/(1.0 + dot(q, q)*0.25);                         // a slow overall swirl
    float cyc = ph*0.115, ca = fract(cyc), cb = fract(cyc + 0.5), wb = abs(2.0*ca - 1.0);
    vec2 qa = q*2.5 + flow*(ca - 0.5)*4.2, qb = q*2.5 + vec2(3.7, 1.9) + flow*(cb - 0.5)*4.2;
    float ga = noise2(qa)*0.58 + noise2(qa*2.4 + 4.0)*0.42;
    float gb = noise2(qb)*0.58 + noise2(qb*2.4 + 4.0)*0.42;
    float gran = mix(ga, gb, wb);
    float fine = noise2(q*11.5 + flow*4.0 + vec2(ph*0.11, -ph*0.07));              // small granules, shimmering
    // threads of brighter plasma along the lanes between cells; they wander and flicker
    float thr = 1.0 - abs(2.0*noise2(q*3.1 + flow*2.6 + vec2(-ph*0.050, ph*0.036)) - 1.0);
    thr = pow(thr, 7.0)*(0.45 + 0.55*noise2(qr*1.6 + vec2(0.43 + ph*0.21, 9.37 - ph*0.05)));
    float heat = 0.33 + 0.44*gran + 0.11*fine + 0.06*(big - 0.5) + 0.17*thr;
    float g2 = fine;
    // active regions: local, white-hot when the Sun is stormy. Two rotated samples with fractional offsets: a single
    // axis-aligned one had a lattice line exactly on the centre meridian, which pow() turned into a bright vertical seam
    float act = noise2(qr*1.2 + vec2(5.37 + ph*0.031, 2.71 + ph*0.090))*0.62 + noise2(vec2(qr.y, -qr.x)*2.1 + vec2(8.43 - ph*0.050, 1.29 + ph*0.022))*0.38;
    heat += pow(act, 5.0)*(0.45 + 2.0*uAct);
    // sunspots: a few small irregular ones in the active latitudes, in lopsided groups, riding the Sun's slow rotation
    vec3 sn = vec3(d/rs, z);
    float rot = ph*0.0045, spot = 0.0;
    float wob = (g2 - 0.5)*0.050;
    for (int k = 0; k < 5; k++) {
      vec4 sp = k == 0 ? vec4(0.55, 0.26, 0.085, 1.0) : k == 1 ? vec4(0.74, 0.41, 0.034, 0.7) : k == 2 ? vec4(-0.95, -0.20, 0.060, 0.9)
              : k == 3 ? vec4(2.60, -0.30, 0.075, 1.0) : vec4(2.95, 0.17, 0.045, 0.7);                       // lon, lat, radius, depth
      float lo = sp.x + rot, cl = cos(sp.y);
      float dd = acos(clamp(dot(sn, vec3(cl*sin(lo), sin(sp.y), cl*cos(lo))), -1.0, 1.0)) + wob;
      spot = max(spot, sp.w*(0.55*smoothstep(sp.z*1.9, sp.z*0.9, dd) + 0.45*smoothstep(sp.z, sp.z*0.45, dd)));  // penumbra + umbra
    }
    heat *= 1.0 - 0.78*spot;
    heat *= 0.16 + 0.84*pow(z, 0.75);                                           // limb darkening: the edge goes deep red
    c += fireRamp(heat*(0.82 + 0.22*uSunGain))*(0.16 + 0.90*heat)*uSunGain*disc;
  }
  if (x > 0.97 && x < 2.6) {
    // chromosphere rim, prominences, thin corona
    float n1 = noise2(an*2.3 + vec2(ph*0.012, 3.0 - ph*0.008));                  // where the active stretches of limb are (slow)
    float surge = noise2(an*3.6 + vec2(7.0 + ph*0.085, ph*0.060));               // each tongue's own rise and fall (seconds)
    float lift = smoothstep(0.50, 0.86, n1)*smoothstep(0.22, 0.80, surge);
    float hgt = 0.020 + (0.090 + 0.20*uAct)*lift;                               // tongues of fire along the limb
    float lean = (noise2(an*2.9 + vec2(ph*0.050, 4.0)) - 0.5)*o*2.2;              // they bend over as they climb
    vec2 al = an + vec2(-an.y, an.x)*lean;
    float fil = noise2(al*5.5 + vec2(o*7.0 - ph*0.30, o*4.5 - ph*0.17));         // texture streams outward: rising fire
    float prom = exp(-o/hgt*1.6)*(0.50 + 0.50*fil)*(0.10 + 0.90*lift);
    float arch = exp(-pow((o - hgt*0.9)/(0.012 + hgt*0.30), 2.0))*lift*smoothstep(0.35, 0.75, fil);   // the bright rim of a loop
    vec3 pc = mix(vec3(0.85,0.14,0.03), vec3(1.0,0.42,0.10), fil)*(prom*0.95 + arch*0.55)*(0.70 + 0.70*uAct);
    pc += vec3(1.0,0.30,0.07)*exp(-o/(0.014 + 0.026*lick))*0.50;                 // chromosphere: a ragged, flickering fringe
    pc += warm*exp(-o*2.4)*0.07;                                                 // soft warm halo: a light source, not a fog bank
    float st = noise2(an*2.6 + vec2(ph*0.020, -ph*0.013));
    pc += warm*exp(-o*(5.5 - 2.0*uAct))*(0.10 + 0.22*st*st + 0.10*uAct);         // thin corona
    c += pc*uSunGain*(1.0 - disc)*(1.0 - uEclipse);
  }
  if (uWind > 0.01 && x > 1.0 && r < 0.75) {                                      // stormy Sun: faint gusts close in, not beams across the frame
    float ang = atan(d.y, -d.x);
    float sw = noise2(vec2(ang*4.5, r*1.6 - uTime*0.35));
    c += warm*pow(sw, 4.0)*uWind*smoothstep(1.0, 2.2, x)*smoothstep(0.75, 0.40, r)/(1.0 + r*r*30.0)*0.14;
  }
  c *= 1.0 - disc*uEclipse;                                                     // 等你: the disc itself goes black
  if (uEclipse > 0.001 && x < 6.0) {                                            // … and a soft pearly corona is all that is left
    float st = noise2(an*3.4 + vec2(uTime*0.030, -uTime*0.020));
    vec3 pearl = vec3(0.74,0.84,1.0);
    float fade = smoothstep(6.0, 3.0, x);
    float cor = exp(-o*2.2)*(0.30 + 0.55*st*st) + exp(-o*0.62)*st*st*0.30 + 0.0020/(r*r + 0.0040);
    float rg = o/0.060;
    c += (pearl*cor*fade + vec3(1.0,0.95,0.90)*exp(-rg*rg)*1.2)*(1.0 - disc)*uEclipse*breathe*uSunGain;
  }
  return vec4(c, max(disc*uEclipse, disc*0.999*(1.0 - uEclipse)));
}
float pulseAt(float rho){                          // 等你: a ring of light travels outward through the orbital plane
  if (uPulse < 0.001) return 0.0;
  float pe = (rho - (0.5 + uPulsePh*9.5))/(0.30 + 0.55*uPulsePh);
  return exp(-pe*pe)*pow(1.0 - uPulsePh, 0.7)*uPulse;
}

/* ---------- comets (sessions) ---------- */
vec3 comets(vec2 frag){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 s = uComet[i]; float pres = uCometB[i].y; if (s.w < 0.5 || pres <= 0.001) continue;
    vec2 p = frag - s.xy; float sz = s.z;
    if (abs(p.x) + abs(p.y) > sz*230.0) continue;
    float code = s.w; float t = uTime + uCometB[i].x; float act = uCometB[i].z;
    vec2 td = normalize(s.xy - uSunScr.xy);
    float al = dot(p, td)/sz, pe = dot(p, vec2(-td.y, td.x))/sz;
    if (al < -14.0 || al > 190.0 || abs(pe) > 14.0 + al*0.42) continue;
    float bound = (1.0 - smoothstep(150.0, 190.0, al))*(1.0 - smoothstep(0.75, 1.0, abs(pe)/(14.0 + al*0.42)));
    vec3 lc; float len = 16.0; float blink = 1.0; float ion = 0.25; float halo = 0.0;
    if (code < 1.5)      { lc = vec3(0.95,0.95,1.0); len = 14.0; blink = 0.9 + 0.1*sin(t*1.3); }
    else if (code < 2.5) { lc = vec3(1.0,0.66,0.26); len = 20.0; blink = 0.45 + 0.55*(0.5 + 0.5*sin(t*1.5)); }
    else if (code < 3.5) { lc = vec3(0.45,0.85,1.0); len = 40.0 + 14.0*act; ion = 1.0; blink = 1.15 + 0.2*sin(t*19.0) + 0.3*act; }
    else if (code < 4.5) { lc = vec3(1.0,0.78,0.42); len = 26.0; ion = 0.4; }
    else { lc = vec3(1.0,0.27,0.12); len = 11.0; sz *= 1.35; float f = fract(t*0.62); blink = 0.60 + 2.6*(exp(-f*9.0) + exp(-abs(f-0.2)*14.0)*step(0.2, f)); halo = 1.0; }
    float rr = length(p)/sz;
    float head = exp(-rr*rr*0.55)*3.0 + 0.5/(rr*rr + 0.35);
    float fa = smoothstep(-1.0, 1.5, al);
    float pe2 = pe - al*al*0.006;                                                // the dust tail curves a little
    float wd = 0.8 + al*0.16;
    float dustT = exp(-pe2*pe2/(wd*wd))*exp(-max(al, 0.0)/len)*fa*0.85;
    float ionT = exp(-pe*pe/0.5)*exp(-max(al, 0.0)/(len*1.8))*fa*ion*0.9;
    vec3 add = lc*(head + dustT) + vec3(0.45,0.70,1.0)*ionT;
    if (halo > 0.0) { float hr = (rr - 5.0 - 3.0*fract(t*0.62))/1.2; add += lc*exp(-hr*hr)*0.5*(1.0 - fract(t*0.62)); }
    vec2 ev = frag/uRes; float edge = smoothstep(0.0, 0.07, min(min(ev.x, 1.0 - ev.x), min(ev.y, 1.0 - ev.y)));
    c += add*blink*pres*bound*edge;
  }
  return c;
}

void main(){
  vec2 frag = gl_FragCoord.xy; vec2 ndc = frag/uRes*2.0 - 1.0;
  vec3 rd = normalize(uCamF + uCamR*ndc.x*uTanHalf.x + uCamU*ndc.y*uTanHalf.y);
  vec3 ro = uCamPos;
  float pix = 2.0*uTanHalf.y/uRes.y;
  vec2 sd = (frag - uSunScr.xy)/uRes.y; float sr = length(sd);
  // the ecliptic plane under this pixel (Sun at the origin, plane y = 0)
  float tE = rd.y < -1e-4 ? -ro.y/rd.y : -1.0;
  vec3 pE = ro + rd*tE; float rhoE = length(pE.xz);
  float graze = 1.0/max(-rd.y, 0.04);
  float pulse = tE > 0.0 ? pulseAt(rhoE) : 0.0;

  // background
  vec3 col = stars(rd, pix)*uStarGain;
  if (uMwGain > 0.001) col += milkyWay(rd, frag)*uStarGain*uMwGain;
  if (tE > 0.0 && uDust > 0.01) {                                              // zodiacal dust: a faint disc in the orbital plane
    float dz = 1.0/(1.0 + rhoE*rhoE*0.20);
    float tex = noise2(pE.xz*0.55 + vec2(uTime*0.004, 0.3))*0.6 + noise2(pE.xz*1.7 + 4.0)*0.4;
    col += vec3(1.0,0.76,0.52)*dz*(0.40 + 0.9*tex)*0.085*uDust*(0.35 + 0.65*uSunGain)*(1.0 - 0.6*uEclipse)*(1.0 + 2.5*pulse);
  }
  col += vec3(0.55,0.70,1.0)*pulse*0.07;
  vec4 sun = sunLayer(sd, sr);
  col = col*(1.0 - sun.a) + sun.rgb;

  // spheres: the nearest one wins (they cross each other as they orbit)
  float cov = 0.0, tHit = 1e9; float fid = -1.0; float mCov = 0.0, mT = 1e9; vec3 mCol = vec3(0.0);
  vec3 nrm = vec3(0.0, 0.0, 1.0), hc = vec3(0.0), hA = vec3(0.0, 1.0, 0.0), hT = vec3(1.0, 0.0, 0.0), hB = vec3(0.0, 0.0, 1.0);
  vec3 halo = vec3(0.0); vec4 hAtm = vec4(0.0);
  for (int i = 0; i < NB; i++) {
    vec2 sdd = frag - uScr[i].xy; if (dot(sdd, sdd) > uScr[i].z*uScr[i].z) continue;
    vec3 c = uP[i].xyz; float R = uP[i].w; vec3 oc = c - ro; float tca = dot(oc, rd);
    float b2 = dot(oc, oc) - tca*tca; float w = tca*pix*0.8;
    float b = sqrt(max(b2, 0.0));
    float cv = smoothstep(R + w, R - w, b);
    vec3 cp = ro + rd*tca - c;
    vec4 atm = uAtm[i];
    float tS = tca - sqrt(max(R*R - b2, 0.0));
    if (atm.w > 0.0 && cv < 1.0 && tca < tHit) {
      vec3 ln = cp/max(b, 1e-4); vec3 L = normalize(uSunPos - c);
      float lit = smoothstep(-0.45, 0.35, dot(ln, L));
      float fwd = pow(max(0.0, dot(rd, L)), 4.0);
      halo += atm.rgb*exp(-max(b - R, 0.0)/(R*atm.w))*(lit*(0.55 + 1.6*fwd)*(uKey + 2.5*pulseAt(length(c))) + 0.04)*(1.0 - cv);
    }
    if (cv > 0.0 && i >= 10) {                                                  // small moons: composited over (or hidden behind) the planets
      if (tS < mT) {
        vec3 mn = b < R ? (ro + rd*tS - c)/R : cp/b; vec3 L = normalize(normalize(uSunPos - c) - rd*0.8);   // lit a little from our side so it reads as a moon, not a hole
        float df = clamp((dot(mn, L) + 0.03)/1.03, 0.0, 1.0);
        vec3 ma = atm.rgb*(0.70 + 0.55*noise3(mn*4.0 + float(i)));
        mCol = ma*vec3(1.0,0.94,0.84)*df*(uKey + 3.2*pulseAt(length(c)))*1.05 + ma*vec3(0.16,0.15,0.15)*(0.3 + 0.7*uKey); mCov = cv; mT = tS;
      }
    } else if (cv > 0.0 && (cov == 0.0 || (tS < tHit ? cv >= 0.5 : cov < 0.5))) {
      // the nearer body wins where it covers at least half the pixel; otherwise the one behind it keeps the pixel
      cov = max(cv, cov); fid = float(i); hc = c; hA = uA[i]; hT = uT[i]; hB = uB[i]; hAtm = vec4(atm.rgb, R);
      tHit = tS;
      nrm = b < R ? (ro + rd*tHit - c)/R : cp/b;
    }
  }
  if (mT > tHit) mCov = 0.0;                                                    // moon behind a planet
  bool inSun = sr*uRes.y < uSunScr.z;
  if (inSun && tHit > uSunDist) { cov = 0.0; tHit = 1e9; }                      // behind the Sun's disc
  if (inSun && mT > uSunDist) mCov = 0.0;

  // orbit lines: the real ellipses, ray against each orbital plane, a pixel or so wide
  float lf = 0.0, lb = 0.0;
  if (tE > 0.0) {
    float slack = 0.06 + tE*pix*3.0*graze;
    for (int j = 0; j < 9; j++) {
      vec4 o = uOrb[j]; vec4 N = uOrbN[j];
      float m = slack + N.w*graze;
      if (rhoE < o.z - m || rhoE > o.w + m) continue;
      float t = -dot(ro, N.xyz)/dot(rd, N.xyz);
      if (t <= 0.0) continue;
      vec3 p = ro + rd*t; float rho = length(p); vec3 ph = p/rho;
      float rA = o.x/(1.0 + o.y*dot(ph, uOrbP[j]));
      vec4 F = uOrbF[j]; float lr = log(rA) - F.x;
      float d = rho - (F.y + (lr < 0.0 ? F.z : F.w)*lr);
      float sp = d*length(ph - rd*dot(ph, rd))/(t*pix);
      float l = exp(-sp*sp*0.9)*(0.32 + 0.68*pow(max(dot(ph, uOrbD[j]), 0.0), 14.0));
      if (t < tHit) lf += l; else lb += l;
    }
  }
  vec3 lineC = vec3(0.60,0.62,0.66)*0.19*(0.45 + 0.55*uKey + 2.5*pulse)*(1.0 - sun.a);
  lf = min(lf, 1.4); lb = min(lb, 1.4 - lf);                                    // far orbits pile up near the horizon
  col += lineC*(lf + lb);
  col += halo;
  if (cov > 0.0) pulse = pulseAt(length(hc));
  if (cov > 0.0) {
    vec3 n = nrm; vec3 L = normalize(uSunPos - hc); vec3 V = -rd;
    vec3 q = vec3(dot(n, hT), dot(n, hA), dot(n, hB));
    float ndl = dot(n, L); float mu = max(dot(n, V), 0.0);
    float wrap = 0.10, rimK = 0.5, limbK = 0.0, spec = 0.0, fill = 1.0;
    vec3 alb; vec3 emis = vec3(0.0); float shadow = 1.0;
    if (fid < 0.5) { alb = sMercury(q); wrap = 0.02; rimK = 0.0; }
    else if (fid < 1.5) { alb = sVenus(q); wrap = 0.30; rimK = 0.9; limbK = 0.3; }
    else if (fid < 2.5) {
      float ocean, cloud, land; alb = sEarth(q, ocean, cloud, land); wrap = 0.16; rimK = 1.3;
      vec3 hv = normalize(L + V); spec = pow(max(dot(n, hv), 0.0), 60.0)*ocean*2.2;
      float city = smoothstep(0.62, 0.80, noise3(q*26.0))*land*(1.0 - cloud);
      emis += vec3(1.0,0.62,0.25)*city*smoothstep(-0.05, -0.35, ndl)*0.14;
      float al = abs(q.y); float ov = belt(al, 0.83, 0.05)*(0.5 + 0.8*noise3(vec3(q.x*6.0, uTime*0.5, q.z*6.0)));
      emis += vec3(0.15,1.0,0.50)*ov*uAurora*(0.25 + 0.75*smoothstep(0.3, -0.2, ndl))*0.9;
    }
    else if (fid < 3.5) { alb = sMoon(q); wrap = 0.02; rimK = 0.0; }
    else if (fid < 4.5) { alb = sMars(q); wrap = 0.06; rimK = 0.45; }
    else if (fid < 5.5) {
      float sp; alb = sJupiter(q, sp); wrap = 0.14; rimK = 0.35; limbK = 0.55;
      { vec3 pw = hc + n*hAtm.w; vec3 oi = uP[10].xyz - pw; float ti = dot(oi, L);       // the shadow of Io on the cloud tops
        if (ti > 0.0) { float bi = length(oi - L*ti)/uP[10].w; shadow = 1.0 - 0.93*smoothstep(1.25, 0.75, bi); } }
      float night = smoothstep(0.15, -0.2, ndl);
      if (uLightning > 0.001) {
        for (int k = 0; k < 3; k++) {
          float fk = float(k); float cyc = uTime*2.2 + fk*0.41; float seed = floor(cyc)*1.37 + fk*91.0; float ph = fract(cyc);
          vec2 h = hash21(seed); float on = step(h.y, uLightning*0.8);
          vec3 fp = normalize(V*0.9 + uCamR*(h.x-0.5)*0.7 + uCamU*(hash11(seed+3.0)-0.5)*0.9 - L*0.8);
          float dd = distance(n, fp); float puls = exp(-ph*10.0)*(1.0 + 0.7*sin(ph*70.0 + fk));
          emis += vec3(0.72,0.80,1.0)*on*puls*(exp(-dd*dd*700.0)*1.8 + exp(-dd*dd*70.0)*0.22)*night*(0.5 + alb.r);
        }
      }
      float al = abs(q.y); float ov = belt(al, 0.90, 0.035)*(0.4 + 0.9*noise3(vec3(q.x*7.0, uTime*0.4, q.z*7.0)));
      emis += vec3(0.50,0.40,1.0)*ov*uAurora*(0.3 + 0.7*night)*1.1;
    }
    else if (fid < 6.5) {
      alb = sSaturn(q); wrap = 0.14; rimK = 0.3; limbK = 0.5;
      vec3 p = n*hAtm.w; float dn = dot(L, hA);
      if (abs(dn) > 1e-3) { float t = -dot(p, hA)/dn; if (t > 0.0) { float r = length(p + L*t)/hAtm.w; shadow = 1.0 - 0.62*satCoarse(r); } }
      float al = abs(q.y); emis += vec3(0.35,0.55,1.0)*belt(al, 0.93, 0.022)*uAurora*0.30;
    }
    else if (fid < 7.5) { alb = sUranus(q); wrap = 0.22; rimK = 0.5; limbK = 0.45; }
    else if (fid < 8.5) { alb = sNeptune(q); wrap = 0.20; rimK = 0.6; limbK = 0.45; }
    else { alb = sPluto(q); wrap = 0.04; rimK = 0.35; }
    float diff = clamp((ndl + wrap)/(1.0 + wrap), 0.0, 1.0);
    float keyL = uKey*(1.0 + 3.2*pulse/max(uKey, 0.2));
    vec3 sunC = vec3(1.0,0.94,0.84);
    vec3 pc = alb*sunC*diff*shadow*keyL*1.05;
    pc *= 1.0 + exp(-pow(ndl*4.0, 2.0))*vec3(0.16, -0.02, -0.12)*step(0.05, wrap);     // warm terminator on worlds with air
    pc *= 1.0 - limbK*(1.0 - pow(mu, 0.55));
    pc += alb*vec3(0.150,0.170,0.230)*(0.35 + 0.65*mu)*(0.30 + 0.70*min(uKey, 1.0));   // fill from our side: we look toward the Sun, so near planets are back-lit
    pc += vec3(0.10,0.14,0.24)*pow(1.0 - mu, 4.0)*0.35;                                 // thin cold rim on the dark limb                                // faint cool fill: night sides stay readable
    pc += sunC*spec*diff*keyL;
    float fres = pow(1.0 - mu, 3.0);
    float sf = smoothstep(-0.30, 0.45, ndl);
    pc += hAtm.rgb*fres*rimK*(0.06 + sf*(0.25 + keyL));
    pc += emis;
    col = mix(col, pc, cov);
    col += (lineC*lf + min(sun.rgb, vec3(0.6))*0.25*(1.0 - sun.a))*cov;                       // lines that pass in front; the Sun's glare veils what is near it
  }

  // rings: Saturn, then the thin ones around Uranus
  {
    vec3 c = uP[6].xyz; float R = uP[6].w; vec3 A = uA[6];
    pulse = pulseAt(length(c));
    float dn = dot(rd, A);
    vec2 rq = frag - uScr[6].xy; float rlim = uScr[6].z*2.3;
    if (abs(dn) > 1e-4 && dot(rq, rq) < rlim*rlim) {
      float t = dot(c - ro, A)/dn; vec3 h = ro + rd*t - c; float r = length(h)/R;
      if (t > 0.0 && r > 1.2 && r < 2.32 && t < tHit) {
        float fw = fwidth(r);
        float d = satDensity(r, fw);
        vec3 L = normalize(uSunPos - c);
        float tc = dot(h, L); float sh = 1.0;
        if (tc < 0.0) { float bb = length(h - L*tc)/R; sh = smoothstep(0.96, 1.05, bb); }
        float same = step(0.0, dot(A, L)*dot(A, -rd));
        float lit = sh*mix(0.42, 1.0, same)*(0.62 + 0.38*abs(dot(A, L)));
        vec3 ice = mix(vec3(0.50,0.44,0.38), vec3(0.86,0.82,0.74), smoothstep(1.45, 1.75, r));
        ice = mix(ice, vec3(0.70,0.69,0.67), smoothstep(1.98, 2.06, r));
        ice *= 0.62 + 0.55*noise3(vec3(r*15.0, 4.0, 1.0));
        float keyL = uKey + 3.2*pulse;
        vec3 rc = ice*lit*keyL*0.80 + ice*vec3(0.035,0.045,0.07);
        rc += vec3(1.0,0.90,0.75)*pow(max(0.0, dot(rd, L)), 5.0)*sh*d*(1.0-d)*2.0*keyL;
        float a = min(d*1.25, 0.96)*smoothstep(0.015, 0.12, abs(dn));
        col = mix(col, rc, a);
      }
    }
    c = uP[7].xyz; R = uP[7].w; A = uA[7]; dn = dot(rd, A); pulse = pulseAt(length(c));
    rq = frag - uScr[7].xy; rlim = uScr[7].z*2.0;
    if (abs(dn) > 1e-4 && dot(rq, rq) < rlim*rlim) {
      float t = dot(c - ro, A)/dn; vec3 h = ro + rd*t - c; float r = length(h)/R;
      if (t > 0.0 && r > 1.5 && r < 2.2 && t < tHit) {
        float fw = fwidth(r)*0.7;
        float d = 0.50*exp(-pow((r - 2.00)/(0.010 + fw), 2.0)) + 0.16*exp(-pow((r - 1.80)/(0.012 + fw), 2.0)) + 0.10*exp(-pow((r - 1.66)/(0.012 + fw), 2.0));
        col += vec3(0.55,0.70,0.74)*d*(0.08 + 0.40*(uKey + 3.2*pulse))*0.55*smoothstep(0.015, 0.12, abs(dn));
      }
    }
  }

  col = mix(col, mCol, mCov);
  if (uHaze > 0.01) {                                                           // drifting dust between us and the planets
    vec2 hp = frag/uRes.y;
    vec2 hq = hp*vec2(1.3, 2.9) + vec2(uTime*0.012, uTime*0.004 + 2.0);
    float hz = noise2(hq);
    hz = smoothstep(0.30, 0.90, hz)*uHaze;
    vec3 hcol = vec3(0.060,0.085,0.120) + vec3(1.0,0.70,0.42)*0.05*uSunGain/(sr*sr*3.0 + 0.25);
    col = mix(col, hcol, hz*0.55) + hcol*hz*0.25;
  }

  // lens: anamorphic streak through the Sun (no ghosts)
  if (uFlare > 0.01) {
    float g = uFlare*uSunGain*(1.0 - uEclipse)*(1.0 - sun.a);
    col += vec3(1.0,0.62,0.34)*exp(-abs(sd.y)*170.0)*exp(-abs(sd.x)*3.2)*0.30*g;
    col += vec3(1.0,0.80,0.60)*exp(-abs(sd.y)*560.0)*exp(-abs(sd.x)*5.0)*0.30*g;
    col += vec3(1.0,0.66,0.38)*exp(-sr*6.0)*0.05*g;
  }
  col += comets(frag);
  col = max(col, 0.0);
  col = sqrt(col/(1.0 + col));
  col += (hash12(frag + fract(uTime)*61.0) - 0.5)/255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const FS_POST = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexRes;
uniform float uTime, uExposure, uWarmth, uNight;
vec3 dec(vec3 c){ c = c*c; c = min(c, vec3(0.996)); return c/(1.0 - c); }
vec3 tex(vec2 uv){ return dec(texture2D(uTex, uv).rgb); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; vec2 d = uv - 0.5; d.x *= uRes.x/uRes.y; float r2 = dot(d, d);
  vec3 c = tex(uv);
  if (r2 > 0.22) { vec2 off = d*min(r2, 0.9)*0.0014; c.r = tex(uv + off).r; c.b = tex(uv - off).b; }
  vec3 bl = vec3(0.0); vec2 px = 1.0/uTexRes;
  bl = tex(uv + px*vec2(2.6, 1.1)) + tex(uv + px*vec2(-1.1, 2.6)) + tex(uv + px*vec2(-2.6, -1.1)) + tex(uv + px*vec2(1.1, -2.6));
  bl *= 0.25;
  c += max(bl - 0.7, 0.0)*0.22;
  c *= uExposure*(1.0 - 0.20*uNight);
  c = aces(c);
  float lum = dot(c, vec3(0.30, 0.59, 0.11));
  vec3 shadow = vec3(0.88, 0.99, 1.12), high = vec3(1.07, 1.00, 0.91);
  c *= mix(shadow, high, smoothstep(0.04, 0.70, lum));
  c *= vec3(1.0 + 0.08*uWarmth, 1.0 + 0.01*uWarmth, 1.0 - 0.10*uWarmth);
  c = mix(c, c*c*(3.0 - 2.0*c), 0.25);
  c = c*0.975 + 0.012;
  c *= 1.0 - 0.60*smoothstep(0.25, 1.35, r2*1.6);
  float g = hash12(gl_FragCoord.xy + fract(uTime*7.0)*vec2(97.0, 31.0)) - 0.5;
  c += g*0.038*(1.0 - lum*0.5);
  gl_FragColor = vec4(c, 1.0);
}`;

/* ------------------------------ state machine ------------------------------ */
const smooth = t => t*t*(3 - 2*t);
let stateName = 'clear', current = { ...STATES.clear }, from = { ...current }, to = { ...current };
let tStart = 0, tDur = 0, override = null, pending = null, debounceT = 0, stateAt = 0;
function requestState(name) {
  if (!STATES[name]) return;
  pending = name; clearTimeout(debounceT);
  debounceT = setTimeout(() => { if (pending !== stateName) applyState(pending); pending = null; }, 300);
}
function applyState(s) {                       // accepts a state name (demo.html) or a state.json object (bridge)
  if (s && typeof s === 'object') { applySessions(s.sessions); if (s.state !== stateName) requestState(STATES[s.state] ? s.state : 'clear'); return; }
  const tgt = STATES[s]; if (!tgt) return;
  stateName = s; stateAt = performance.now()/1000;
  from = { ...current }; to = { ...tgt };
  let maxd = 0; for (const p in PARAMS) { const [lo, hi] = PARAMS[p]; maxd = Math.max(maxd, Math.abs(to[p] - from[p])/(hi - lo)); }
  tDur = Math.max(1.0, CONFIG.fullTransition*maxd); tStart = stateAt;
}
function tickParams(now) {
  const e = tDur > 0 ? smooth(Math.min(1, (now - tStart)/tDur)) : 1;
  for (const p in PARAMS) current[p] = from[p] + (to[p] - from[p])*e;
  if (override) Object.assign(current, override);
}

/* ------------------------------ sessions → comets ------------------------------ */
let slots = [null, null, null, null, null];
const comets = Array.from({ length: 5 }, (_, i) => ({ st: null, code: 0, fade: 0, phase: i*1.73 + 0.4, activity: 0 }));
let evOk = null, ev = null, lastLatency = 0;
function applySessions(list) {
  const nxt = (Array.isArray(list) ? list : []).slice(0, 5); while (nxt.length < 5) nxt.push(null);
  nxt.forEach((st, i) => { if (st && STATES[st]) { comets[i].st = st; comets[i].code = CODE[st]; } else comets[i].st = null; });
  slots = nxt;
}
async function pollState() {
  const t0 = performance.now();
  try { const r = await fetch('state.json', { cache: 'no-store' }); lastLatency = performance.now() - t0; if (r.ok) applyState(await r.json()); } catch (e) {}
  try {
    const r = await fetch('events.json', { cache: 'no-store' });
    if (r.ok) { ev = await r.json(); evOk = true; } else evOk = false;
  } catch (e) { evOk = false; }
  // activity per slot: events in the last 12 s (events.json); without it, from the state alone
  const now = ev && ev.now || Date.now(); const act = [0, 0, 0, 0, 0];
  if (evOk && ev && Array.isArray(ev.recent)) for (const e of ev.recent) if (e && e.slot >= 0 && e.slot < 5 && now - e.t < 12000) act[e.slot] += 0.25;
  comets.forEach((s, i) => { s.activity = evOk ? Math.min(1, act[i]) : (s.st === 'storm' ? 0.7 : 0.2); });
}

/* ------------------------------ GL ------------------------------ */
const cv = document.getElementById('c');
const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
let errors = [];
window.addEventListener('error', e => { errors.push(String(e.message || e)); if (errors.length > 6) errors.shift(); });
function compile(type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}
function program(fs) {
  const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
let scene, post, fbo, tex, W = 0, H = 0, SW = 0, SH = 0, glOk = false;
try {
  if (!gl) throw new Error('no webgl');
  if (!gl.getExtension('OES_standard_derivatives')) throw new Error('no OES_standard_derivatives');
  scene = program(FS_SCENE); post = program(FS_POST);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  for (const pr of [scene, post]) { const a = gl.getAttribLocation(pr.p, 'aP'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  fbo = gl.createFramebuffer();
  glOk = true;
} catch (e) { errors.push(String(e.message || e)); console.error(e); }

function resize() {
  const dpr = Math.min(1, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(innerWidth*dpr)), h = Math.max(2, Math.round(innerHeight*dpr));
  const sw = Math.max(2, Math.round(w*CONFIG.scale)), sh = Math.max(2, Math.round(h*CONFIG.scale));
  if (w === W && h === H && sw === SW && sh === SH) return;
  W = w; H = h; cv.width = w; cv.height = h; SW = sw; SH = sh;
  if (!glOk) return;
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SW, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ------------------------------ world ------------------------------ */
const v = {
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  cross: (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]],
  dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  add: (a, b, s = 1) => [a[0] + b[0]*s, a[1] + b[1]*s, a[2] + b[2]*s],
  scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
};
const ASPECT0 = 16/9, D2R = Math.PI/180;
/* Real orbits, compressed. Positions come from JPL's approximate Keplerian elements (Standish, valid 1800–2050):
   mean longitude and longitude of perihelion → mean anomaly → Kepler's equation → true anomaly → ecliptic x, y, z.
   Only the distance is squashed so 0.39 … 49 AU fits one frame: a log scale, piecewise linear in ln(r) through the
   display radius chosen for each planet's semi-major axis (SCALE). It is monotonic, so the order is always right and
   Pluto's perihelion really does dip inside Neptune's orbit. Direction, eccentricity and inclination are untouched
   (Mercury's and Mars' off-centre ellipses and Pluto's 17° tilt are the real ones). */
const SCALE = { mercury: 1.25, venus: 1.85, earth: 2.35, mars: 2.95, jupiter: 4.55, saturn: 6.10, uranus: 7.25, neptune: 8.06, pluto: 8.55 };
const J2000 = Date.UTC(2000, 0, 1, 12);
//             a (AU)       e           I (deg)      L (deg)        long.peri      long.node     L°/cy            peri°/cy     node°/cy
const ELEMENTS = {
  mercury: [0.38709927, 0.20563593,  7.00497902, 252.25032350,  77.45779628,  48.33076593, 149472.67411175,  0.16047689, -0.12534081],
  venus:   [0.72333566, 0.00677672,  3.39467605, 181.97909950, 131.60246718,  76.67984255,  58517.81538729,  0.00268329, -0.27769418],
  earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193,   0.0,         35999.37244981,  0.32327364,  0.0],
  mars:    [1.52371034, 0.09339410,  1.84969142,  -4.55343205, -23.94362959,  49.55953891,  19140.30268499,  0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624,  1.30439695,  34.39644051,  14.72847983, 100.47390909,   3034.74612775,  0.21252668,  0.20469106],
  saturn:  [9.53667594, 0.05386179,  2.48599187,  49.95424423,  92.59887831, 113.66242448,   1222.49362201, -0.41897216, -0.28867794],
  uranus:  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630,  74.01692503,    428.48202785,  0.40805281,  0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969,  44.96476227, 131.78422574,    218.45945325, -0.32241464, -0.00508664],
  pluto:   [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684,   145.20780515, -0.04062942, -0.01183482],
};
const KNOTS = Object.keys(SCALE).map(k => [Math.log(ELEMENTS[k][0]), SCALE[k]]);
const slope = i => (KNOTS[i + 1][1] - KNOTS[i][1])/(KNOTS[i + 1][0] - KNOTS[i][0]);
function squash(r) {                               // AU → display units
  const x = Math.log(r); let i = 0; while (i < KNOTS.length - 2 && x > KNOTS[i + 1][0]) i++;
  return KNOTS[i][1] + slope(i)*(x - KNOTS[i][0]);
}
/* Camera candidates (?cam=a|b|c|0). All are locked off: nothing moves but the planets.
   pos / tgt in display units (Sun at the origin, y = ecliptic north, +z = toward the camera's side), roll in degrees,
   tanV = half the vertical field of view, lon = the ecliptic longitude that faces the camera,
   slots = where the five session comets sit (fractions of the frame, y up). */
const CAMS = {
  // mw: where the Milky Way crosses the frame — two points of the band and the galactic core, as screen fractions (x, y up)
  0: { mw: [[0.05, 0.95], [0.95, 0.20], [0.30, 0.74]], pos: [0.0, 5.0, 11.8],  tgt: [0.9, 0.0, 1.5],   roll: -5, tanV: 0.43, lon: 100, slots: [[0.600, 0.900], [0.700, 0.810], [0.800, 0.900], [0.880, 0.730], [0.950, 0.840]] },
  a: { mw: [[0.05, 0.98], [0.98, 0.55], [0.80, 0.63]], pos: [0.0, 1.25, 11.2], tgt: [2.2, 0.20, 0.0],  roll: -3, tanV: 0.30, lon: 100, slots: [[0.716, 0.700], [0.596, 0.790], [0.465, 0.815], [0.357, 0.820], [0.251, 0.785]] },
  // b: looking down on the Sun in the upper right, orbit arcs fanning out toward the lower left (user's reference, 2026-11-10; tuned at 16:9)
  b: { mw: [[0.02, 0.80], [0.80, 0.02], [0.33, 0.49]], pos: [0.0, 5.4, 6.6],   tgt: [-3.0, -0.8, 3.8], roll: -20, tanV: 0.56, lon: 75, slots: [[0.40, 0.90], [0.30, 0.84], [0.20, 0.91], [0.12, 0.80], [0.08, 0.92]] },
  c: { mw: [[0.05, 0.95], [0.95, 0.30], [0.25, 0.80]], pos: [0.0, 5.6, 6.4],   tgt: [1.3, 0.0, 1.0],   roll: -8, tanV: 0.42, lon: 100, slots: [[0.86, 0.60], [0.80, 0.74], [0.70, 0.84], [0.58, 0.88], [0.46, 0.89]] },
};
const CAM_KEY = CAMS[Q.get('cam')] ? Q.get('cam') : 'b', CAM = CAMS[CAM_KEY];   // default: b
const CAM_LON = Q.has('lon') ? +Q.get('lon') : CAM.lon;
const PHI = (CAM_LON + 90)*D2R, cPhi = Math.cos(PHI), sPhi = Math.sin(PHI);
const e2w = (x, y, z) => [x*cPhi + y*sPhi, z, x*sPhi - y*cPhi];               // ecliptic → world (y = ecliptic north, +z toward the camera)
function helio(name, days) {                       // days since J2000 → where it is, and the shape of its orbit
  const [a, e, I0, L0, w0, O0, Ld, wd, Od] = ELEMENTS[name], Tc = days/36525;
  const I = I0*D2R, wb = (w0 + wd*Tc)*D2R, Om = (O0 + Od*Tc)*D2R, om = wb - Om;
  let M = ((L0 + Ld*Tc)*D2R - wb) % (2*Math.PI); if (M > Math.PI) M -= 2*Math.PI; if (M < -Math.PI) M += 2*Math.PI;
  let E = M + e*Math.sin(M); for (let k = 0; k < 6; k++) E -= (E - e*Math.sin(E) - M)/(1 - e*Math.cos(E));
  const xp = a*(Math.cos(E) - e), yp = a*Math.sqrt(1 - e*e)*Math.sin(E), r = Math.hypot(xp, yp), nu = Math.atan2(yp, xp);
  const cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  const at = u => [cO*Math.cos(u) - sO*Math.sin(u)*cI, sO*Math.cos(u) + cO*Math.sin(u)*cI, Math.sin(u)*sI];   // unit vector at argument of latitude u
  const d = at(nu + om), peri = at(om);
  const rmin = squash(a*(1 - e)), rmax = squash(a*(1 + e));
  return { r, lon: (Math.atan2(d[1], d[0])/D2R + 360) % 360, dir: e2w(...d), pos: v.scale(e2w(...d), squash(r)), peri: e2w(...peri),
    N: e2w(sO*sI, -cO*sI, cI), p: a*(1 - e*e), e, rmin, rmax, zmax: rmax*Math.abs(sI) };
}
const pole = (lon, lat) => v.norm(e2w(Math.cos(lat*D2R)*Math.cos(lon*D2R), Math.cos(lat*D2R)*Math.sin(lon*D2R), Math.sin(lat*D2R)));
const SUN_POS = [0, 0, 0], SUN_R = 0.55;
// locked-off camera above the plane, outside every orbit, a little rolled so the ecliptic runs on a diagonal
let CAM_POS = CAM.pos, CAM_TGT = CAM.tgt, CAM_ROLL = CAM.roll*D2R, TAN_V = CAM.tanV;
// name, radius (display units, exaggerated but ordered: Jupiter and Saturn largest), spin rad/s, atmosphere, north pole in
// ecliptic (lon, lat) — fixed in space, so Saturn's rings and Uranus' axis do not turn with the orbit
const BODIES = [
  { name: 'mercury', r: 0.085, spin: 0.010, atm: [0, 0, 0, 0],             A: pole(0, 90) },
  { name: 'venus',   r: 0.150, spin: 0.006, atm: [1.00, 0.84, 0.55, 0.070], A: pole(0, 87) },
  { name: 'earth',   r: 0.160, spin: 0.016, atm: [0.30, 0.55, 1.00, 0.050], A: pole(90, 66.56) },
  { name: 'moon',    r: 0.042, spin: 0,     atm: [0, 0, 0, 0],             A: pole(0, 90), of: 'earth', orbit: 0.280, period: 27.32 },
  { name: 'mars',    r: 0.115, spin: 0.012, atm: [0.95, 0.55, 0.38, 0.030], A: pole(352.9, 63.3) },
  { name: 'jupiter', r: 0.460, spin: 0,     atm: [0.95, 0.78, 0.60, 0.012], A: null },   // tipped back from the camera so the Great Red Spot stays in view
  { name: 'saturn',  r: 0.330, spin: 0.008, atm: [0.95, 0.85, 0.62, 0.012], A: pole(79.5, 61.9) },
  { name: 'uranus',  r: 0.210, spin: 0.004, atm: [0.50, 0.90, 0.95, 0.040], A: pole(257.6, 7.7) },
  { name: 'neptune', r: 0.200, spin: 0.006, atm: [0.28, 0.48, 1.00, 0.045], A: pole(318, 61.7) },
  { name: 'pluto',   r: 0.110, spin: 0,     atm: [0.35, 0.55, 1.00, 0.035], A: null },   // heart toward the camera
  // moons other than ours run on shortened clocks so they can be seen moving (Io really takes 1.8 days)
  { name: 'io',      r: 0.034, spin: 0, atm: [0.86, 0.74, 0.36, 0],    A: [0, 1, 0], of: 'jupiter', orbit: 0.62, period: 14 },
  { name: 'europa',  r: 0.030, spin: 0, atm: [0.74, 0.69, 0.62, 0],    A: [0, 1, 0], of: 'jupiter', orbit: 0.80, period: 28 },
  { name: 'titan',   r: 0.046, spin: 0, atm: [0.86, 0.60, 0.26, 0.10], A: [0, 1, 0], of: 'saturn',  orbit: 0.92, period: 15.95 },
];
const ORBITERS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const NB = BODIES.length, byName = Object.fromEntries(BODIES.map(b => [b.name, b]));
const uPArr = new Float32Array(NB*4), uAArr = new Float32Array(NB*3), uTArr = new Float32Array(NB*3), uBArr = new Float32Array(NB*3), uAtmArr = new Float32Array(NB*4), uScrArr = new Float32Array(NB*3);
const uOrbFArr = new Float32Array(36), uOrbArr = new Float32Array(36), uOrbNArr = new Float32Array(36), uOrbPArr = new Float32Array(27), uOrbDArr = new Float32Array(27);
BODIES.forEach((b, i) => { uAtmArr.set(b.atm, i*4); });

// simulated time: starts on today's real date and runs at CONFIG.daysPerSecond × the state's flow
const START_DAYS = ((Q.has('date') ? Date.parse(Q.get('date')) : Date.now()) - J2000)/86400000;
let simDays = 0;

function nightness() {
  const d = new Date(), h = CONFIG.clockHours ?? d.getHours() + d.getMinutes()/60;
  const ss = x => { x = Math.min(1, Math.max(0, x)); return x*x*(3 - 2*x); };
  return h >= 12 ? ss((h - 17.5)/2) : 1 - ss((h - 5)/2);
}
const frame = { night: 0, pos: CAM_POS, F: [0, 0, -1], R: [1, 0, 0], U: [0, 1, 0], tanH: 1, tanV: 1, sunScr: [0, 0, 1], sunDist: 10, starGain: 1, pulsePh: 0 };
function project(p) {                              // world → render pixels
  const d = v.add(p, frame.pos, -1), z = v.dot(d, frame.F);
  return [(v.dot(d, frame.R)/z/frame.tanH*0.5 + 0.5)*SW, (v.dot(d, frame.U)/z/frame.tanV*0.5 + 0.5)*SH, z];
}
// Milky Way axes in world space, from where the camera preset wants the band on screen (computed once: it is the sky)
let MW = null;
function milkyWayAxes() {
  const F = v.norm(v.add(CAM_TGT, CAM_POS, -1));
  const R0 = v.norm(v.cross(F, [0, 1, 0])), U0 = v.cross(R0, F), cr = Math.cos(CAM_ROLL), sr = Math.sin(CAM_ROLL);
  const R = v.add(v.scale(R0, cr), U0, sr), U = v.add(v.scale(U0, cr), R0, -sr);
  const ray = ([x, y]) => v.norm(v.add(v.add(F, R, (2*x - 1)*TAN_V*ASPECT0), U, (2*y - 1)*TAN_V));
  const d1 = ray(CAM.mw[0]), d2 = ray(CAM.mw[1]), N = v.norm(v.cross(d1, d2));
  const c0 = ray(CAM.mw[2]), C = v.norm(v.add(c0, N, -v.dot(c0, N)));
  MW = { N, C, T: v.cross(N, C) };
}
function updateCamera(T) {
  // locked-off camera: no shake, no drift (user, 2026-11-10); the slow push-in (zoom) stays
  const F = v.norm(v.add(CAM_TGT, CAM_POS, -1));
  const R0 = v.norm(v.cross(F, [0, 1, 0])), U0 = v.cross(R0, F), cr = Math.cos(CAM_ROLL), sr = Math.sin(CAM_ROLL);
  frame.F = F; frame.R = v.add(v.scale(R0, cr), U0, sr); frame.U = v.add(v.scale(U0, cr), R0, -sr); frame.pos = CAM_POS;
  const asp = SW/SH, zoom = 1 - 0.045*current.zoom;
  if (asp >= ASPECT0) { frame.tanV = TAN_V*zoom; frame.tanH = frame.tanV*asp; }
  else { frame.tanH = TAN_V*ASPECT0*zoom; frame.tanV = frame.tanH/asp; }     // narrower screens keep the full width
  const s = project(SUN_POS);
  frame.sunDist = Math.hypot(...CAM_POS);
  frame.sunScr = [s[0], s[1], SUN_R/s[2]/frame.tanV*0.5*SH];
  frame.starGain = (0.55 + 0.55*frame.night)*(1 + 0.5*current.eclipse)*(1 - 0.25*Math.min(1, current.sunGain));
  // where everything is today
  const days = START_DAYS + simDays;
  ORBITERS.forEach((name, j) => {
    const h = helio(name, days), b = byName[name]; b.pos = h.pos; b.lon = h.lon;
    uOrbFArr.set([KNOTS[j][0], KNOTS[j][1], slope(Math.max(j - 1, 0)), slope(Math.min(j, KNOTS.length - 2))], j*4);
    uOrbArr.set([h.p, h.e, h.rmin, h.rmax], j*4); uOrbNArr.set([...h.N, h.zmax], j*4); uOrbPArr.set(h.peri, j*3); uOrbDArr.set(h.dir, j*3);
  });
  BODIES.forEach((b, i) => {
    const Z = v.norm(v.add(CAM_POS, (b.of ? byName[b.of] : b).pos, -1));
    let A = b.A;
    if (b.name === 'jupiter') { const Zh = v.norm([Z[0], 0, Z[2]]); A = v.norm(v.add([0, 1, 0], Zh, -0.42)); }
    if (b.name === 'pluto') A = v.norm(v.add([0, 1, 0], Z, -Z[1]));
    if (b.of) {                                                                // a moon: circle in its planet's equatorial plane (ours: in the ecliptic)
      const P = byName[b.of], N = b.name === 'moon' ? [0, 1, 0] : P.Aeff;
      const e1 = v.norm(v.cross(N, [0.3, 0.1, 1])), e2 = v.cross(N, e1), a = 2*Math.PI*days/b.period + i;
      b.pos = v.add(v.add(P.pos, e1, b.orbit*Math.cos(a)), e2, b.orbit*Math.sin(a));
    }
    b.Aeff = A;
    let T0 = v.cross(A, Z); if (Math.hypot(...T0) < 1e-3) T0 = v.cross(A, [1, 0, 0]); T0 = v.norm(T0);
    const B0 = v.cross(T0, A), a = b.spin*T, c = Math.cos(a), s2 = Math.sin(a);
    uPArr.set([...b.pos, b.r], i*4); uAArr.set(A, i*3);
    uTArr.set(v.add(v.scale(T0, c), B0, s2), i*3); uBArr.set(v.add(v.scale(B0, c), T0, -s2), i*3);
    const p = project(b.pos), rp = b.r/p[2]/frame.tanV*0.5*SH;
    uScrArr.set([p[0], p[1], p[2] > 0.2 ? rp*(1.06 + 5.5*((i < 10 || b.name === 'titan') ? b.atm[3] : 0)) + 2.5 : 0], i*3);
  });
}

/* ------------------------------ render ------------------------------ */
const comA = new Float32Array(20), comB = new Float32Array(20);
// comet slots: a loose line in the empty sky above the far side of the orbits (x, y as fractions of the frame)
let SLOT = CAM.slots;
let fps = 30, frameMs = 0, T = 0, last = 0, paused = false;
function render(T) {
  if (!glOk) return;
  tickParams(performance.now()/1000);
  frame.night = nightness();
  updateCamera(T);
  frame.pulsePh = (T/3.8) % 1;
  const dT = Math.max(0, Math.min(0.2, T - (frame.lastT ?? T))); frame.lastT = T;
  frame.sunPh = (frame.sunPh ?? 40) + dT*(0.35 + 2.4*current.activity);          // convection speed follows the Sun's activity
  if (frame.sunFix != null) frame.sunPh = frame.sunFix;
  const px = SH/540; const sizes = [1.0, 0.85, 1.12, 0.9, 1.0];
  for (let i = 0; i < 5; i++) {
    const s = comets[i];
    s.fade += ((s.st ? 1 : 0) - s.fade)*Math.min(1, 1/CONFIG.fps/1.4);
    const x = SLOT[i][0] + 0.006*Math.sin(T*0.05 + i*1.3), y = SLOT[i][1] + 0.008*Math.sin(T*0.04 + i*2.1);
    comA.set([x*SW, y*SH, sizes[i]*px*1.9, s.fade > 0.001 ? s.code : 0], i*4);
    comB.set([s.phase, s.fade, s.activity, 0], i*4);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SW, SH);
  gl.useProgram(scene.p); const u = scene.u;
  gl.uniform2f(u.uRes, SW, SH); gl.uniform1f(u.uTime, T);
  gl.uniform3fv(u.uCamPos, frame.pos); gl.uniform3fv(u.uCamF, frame.F); gl.uniform3fv(u.uCamR, frame.R); gl.uniform3fv(u.uCamU, frame.U);
  gl.uniform2f(u.uTanHalf, frame.tanH, frame.tanV);
  gl.uniform4fv(u.uP, uPArr); gl.uniform3fv(u.uA, uAArr); gl.uniform3fv(u.uT, uTArr); gl.uniform3fv(u.uB, uBArr); gl.uniform4fv(u.uAtm, uAtmArr); gl.uniform3fv(u.uScr, uScrArr);
  if (!MW) milkyWayAxes();
  gl.uniform3fv(u.uMwN, MW.N); gl.uniform3fv(u.uMwC, MW.C); gl.uniform3fv(u.uMwT, MW.T); gl.uniform1f(u.uMwGain, CONFIG.milkyWay);
  gl.uniform3fv(u.uSunPos, SUN_POS); gl.uniform3fv(u.uSunScr, frame.sunScr); gl.uniform1f(u.uSunDist, frame.sunDist);
  gl.uniform4fv(u.uOrb, uOrbArr); gl.uniform4fv(u.uOrbF, uOrbFArr); gl.uniform4fv(u.uOrbN, uOrbNArr); gl.uniform3fv(u.uOrbP, uOrbPArr); gl.uniform3fv(u.uOrbD, uOrbDArr);
  const night = frame.night;
  gl.uniform1f(u.uHaze, current.haze); gl.uniform1f(u.uSunPh, frame.sunPh); gl.uniform1f(u.uAct, current.activity); gl.uniform1f(u.uWind, current.wind); gl.uniform1f(u.uFlare, current.flare);
  gl.uniform1f(u.uSunGain, current.sunGain*(1 - 0.18*night)); gl.uniform1f(u.uEclipse, current.eclipse); gl.uniform1f(u.uPulse, current.pulse);
  gl.uniform1f(u.uPulsePh, frame.pulsePh); gl.uniform1f(u.uDust, current.dust); gl.uniform1f(u.uKey, current.key*(1 - 0.15*night));
  gl.uniform1f(u.uAurora, Math.min(1, current.aurora + 0.10*night)); gl.uniform1f(u.uLightning, current.lightning); gl.uniform1f(u.uTurb, current.turbulence);
  gl.uniform1f(u.uStarGain, frame.starGain); gl.uniform1f(u.uGrs, 0.25*Math.sin(T*0.013));
  gl.uniform4fv(u.uComet, comA); gl.uniform4fv(u.uCometB, comB);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  gl.useProgram(post.p); const q = post.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(q.uTex, 0);
  gl.uniform2f(q.uRes, W, H); gl.uniform2f(q.uTexRes, SW, SH); gl.uniform1f(q.uTime, T);
  gl.uniform1f(q.uExposure, current.exposure); gl.uniform1f(q.uWarmth, current.warmth - 0.25*night); gl.uniform1f(q.uNight, night);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function loop(now) {
  if (paused || document.hidden) return;
  requestAnimationFrame(loop);
  if (now - last < 1000/CONFIG.fps - 1) return;
  const dt = Math.min(0.1, (now - last)/1000 || 1/30); last = now; T += dt; simDays += dt*CONFIG.daysPerSecond*current.flow;
  fps = fps*0.95 + (1/dt)*0.05;
  const f0 = performance.now();
  resize(); render(T);
  frameMs = frameMs*0.9 + (performance.now() - f0)*0.1;
  if (DEBUG) drawDebug();
}
window.wpPause = on => { paused = !!on; if (!paused && !document.hidden) { last = performance.now(); requestAnimationFrame(loop); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden && !paused) { last = performance.now(); requestAnimationFrame(loop); } });
for (const e of ['contextmenu', 'selectstart', 'dragstart']) addEventListener(e, ev => ev.preventDefault());
addEventListener('keydown', e => { if (KEYS[e.key]) requestState(KEYS[e.key]); });

/* ------------------------------ debug (?debug=1) ------------------------------ */
const dbg = document.getElementById('dbg'); let dbgAt = 0;
function drawDebug() {
  const now = performance.now(); if (now - dbgAt < 250) return; dbgAt = now;
  const L = [];
  L.push(`solar-fable · state ${stateName}${pending ? ' → ' + pending : ''} · ${(now/1000 - stateAt).toFixed(0)} s · bridge ${lastLatency.toFixed(0)} ms · events.json ${evOk === null ? '…' : evOk ? 'ok' : 'missing'}`);
  L.push('slots  ' + slots.map((s, i) => `${i}:${s || '—'}${comets[i].activity ? '(' + comets[i].activity.toFixed(1) + ')' : ''}`).join('  '));
  L.push('params ' + Object.keys(PARAMS).map(p => `${p} ${current[p].toFixed(2)}`).join(' · '));
  L.push(`date ${window.theme.date} · ${CONFIG.daysPerSecond} d/s × ${current.flow.toFixed(2)} · ` + ORBITERS.map(n => n.slice(0, 2) + ' ' + (byName[n].lon || 0).toFixed(0) + '°').join(' '));
  L.push(`night ${frame.night.toFixed(2)} ${CONFIG.clockHours != null ? 'clock ' + CONFIG.clockHours : 'real clock'} · sun ${frame.sunScr.map(x => x.toFixed(0)).join(',')}`);
  L.push(`render ${fps.toFixed(0)} fps · ${frameMs.toFixed(1)} ms cpu · scene ${SW}×${SH} → ${W}×${H}`);
  if (errors.length) L.push('errors: ' + errors.join(' | '));
  dbg.textContent = L.join('\n');
}

/* ------------------------------ testing hooks (demo.html) ------------------------------ */
window.theme = {
  requestState, applyState, STATES, PARAMS, CONFIG,
  setOverride(o) { override = o; },
  jump(name) { if (!STATES[name]) return; clearTimeout(debounceT); pending = null; applyState(name); tDur = 0; for (const p in PARAMS) current[p] = to[p]; },
  setSessions(a) { applySessions(a); comets.forEach(c => { c.fade = c.st ? 1 : 0; }); },
  setTime(t) { T = t; },
  setSunPhase(p) { frame.sunFix = p; },              // freeze the surface clock (tests); null = run
  setDays(d) { simDays = d; },                       // simulated days since the start date
  get days() { return simDays; }, get date() { return new Date(J2000 + (START_DAYS + simDays)*86400000).toISOString().slice(0, 10); },
  setCamera(pos, tgt, rollDeg, tanV, slots) { CAM_POS = pos; CAM_TGT = tgt; CAM_ROLL = rollDeg*D2R; TAN_V = tanV; if (slots) SLOT = slots; MW = null; },
  setMilkyWay(p1, p2, core) { CAM.mw = [p1, p2, core]; MW = null; },
  get cam() { return CAM_KEY; },
  // per planet: share of its orbit that is inside the frame, and its on-screen radius (fraction of frame height) nearest / farthest
  coverage() {
    resize(); updateCamera(T); const o = {}; const el = ELEMENTS;
    for (const n of ORBITERS) { let inside = 0, lo = 1, hi = 0; const P = el[n][0]**1.5*365.25;
      for (let k = 0; k < 180; k++) { const h = helio(n, START_DAYS + k/180*P), p = project(h.pos), r = byName[n].r/p[2]/frame.tanV*0.5;
        if (p[2] > 0 && p[0] > 0 && p[0] < SW && p[1] > 0 && p[1] < SH) inside++; lo = Math.min(lo, r); hi = Math.max(hi, r); }
      o[n] = [+(inside/180).toFixed(2), +lo.toFixed(3), +hi.toFixed(3)]; }
    return o;
  },
  longitudes() { const o = {}; for (const n of ORBITERS) { const h = helio(n, START_DAYS + simDays); o[n] = [+h.lon.toFixed(1), +h.r.toFixed(3)]; } return o; },
  get current() { return { ...current }; }, get state() { return stateName; }, get sessions() { return slots.slice(); },
  snapshot(type = 'image/jpeg', quality = 0.92) { resize(); render(T); return cv.toDataURL(type, quality); },
  renderOnce() { resize(); render(T); gl && gl.finish(); },
  // GPU cost of one frame in ms (draw + finish, averaged)
  // GPU ms per frame: (k2 frames + one sync read) minus (k1 frames + one sync read), so the cost of the read itself cancels
  bench(k1 = 2, k2 = 12, rounds = 7) {
    resize(); const px = new Uint8Array(4);
    const run = k => { let best = 1e9; for (let r = 0; r < rounds; r++) { const t0 = performance.now(); for (let i = 0; i < k; i++) render(T + i*0.033); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); } return best; };
    run(2); const a = run(k1), b = run(k2); return (b - a)/(k2 - k1);
  },
  errors,
};

(async () => {
  resize(); await pollState();
  clearTimeout(debounceT); if (pending) { applyState(pending); pending = null; }
  for (const p in PARAMS) current[p] = to[p];                         // start on the polled state, no fade-in
  comets.forEach(c => { c.fade = c.st ? 1 : 0; });
  setInterval(() => { if (CONFIG.polling && !paused && !document.hidden) pollState(); }, 1000);
  last = performance.now(); requestAnimationFrame(loop);
})();
