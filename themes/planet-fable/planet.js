/* themes/planet-fable — 行星・Fable (2026-11-10)
   One film frame: a ringed gas giant over the horizon of a moon, shot from low orbit. Everything is a single
   WebGL fragment shader (no textures, no libraries): analytic planet / ring / moon, value-noise cloud bands with
   domain warping, atmosphere rim + forward scattering, ring shadows both ways, star field + milky way, lightning,
   aurorae, meteors, an anamorphic flare, then a post pass (half-res upscale, chromatic aberration, bloom, ACES,
   split-tone grading, vignette, film grain).
   The star walks around the planet with Claude's state (see STATES): side light when idle, half phase and
   churning bands while thinking, a crescent with night-side lightning while working, sunrise over the limb when
   wrapping up, and a full eclipse (black disc, breathing ring of atmosphere) while waiting for the user.
   Each of the 5 session slots is a small ship above the moon's horizon; its lights follow that session's state.
   Conventions (themes/README.md): state.json every second, events.json optional, window.wpPause, document.hidden,
   ?day=1 / ?night=1 (night = thinner crescent, darker, more stars), window.theme for demo.html, ?debug=1 panel. */
'use strict';
const Q = new URLSearchParams(location.search);
const DEBUG = Q.get('debug') === '1';
if (DEBUG) document.body.classList.add('debug');

const CONFIG = {
  fullTransition: 6.0,          // seconds for a full-range parameter change (demo.html can change it)
  polling: true,
  fps: 30,
  scale: 0.40,                  // scene render scale (post pass runs at canvas size)
  clockHours: Q.has('day') ? 10.5 : Q.has('night') ? 22 : null,
};
// parameter ranges (demo.html sliders; also used to normalise transition distance)
const PARAMS = {
  sunAngle:   [0, 120],   // degrees between planet centre and star as seen from the camera (0 = eclipse)
  turbulence: [0, 1],     // cloud band domain warping / drift speed
  vortex:     [0, 1],     // the great storm spot
  lightning:  [0, 1],     // night-side flash rate
  aurora:     [0, 1],     // polar ovals
  haze:       [0, 1],     // dust haze above the moon's horizon
  flare:      [0, 1],     // lens flare strength
  warmth:     [-1, 1],    // colour grading: cool … warm
  shake:      [0, 1],     // camera micro-motion
  meteors:    [0, 1],     // streaks in the sky
  beacon:     [0, 1],     // 等你: the eclipse ring breathes
  exposure:   [0.4, 1.6],
};
const STATES = {
  clear:    { sunAngle: 98, turbulence: 0.25, vortex: 0.30, lightning: 0.04, aurora: 0.25, haze: 0.30, flare: 0.55, warmth: 0.35, shake: 0.08, meteors: 0.10, beacon: 0, exposure: 1.00 },
  overcast: { sunAngle: 80, turbulence: 0.80, vortex: 0.75, lightning: 0.15, aurora: 0.45, haze: 0.65, flare: 0.35, warmth: -0.30, shake: 0.15, meteors: 0.12, beacon: 0, exposure: 0.88 },
  storm:    { sunAngle: 62, turbulence: 1.00, vortex: 1.00, lightning: 1.00, aurora: 1.00, haze: 0.55, flare: 0.50, warmth: -0.55, shake: 0.65, meteors: 1.00, beacon: 0, exposure: 0.95 },
  clearing: { sunAngle: 25, turbulence: 0.40, vortex: 0.40, lightning: 0.06, aurora: 0.55, haze: 0.40, flare: 1.00, warmth: 0.85, shake: 0.12, meteors: 0.15, beacon: 0, exposure: 1.12 },
  waiting:  { sunAngle: 6,  turbulence: 0.20, vortex: 0.20, lightning: 0.00, aurora: 0.40, haze: 0.25, flare: 0.25, warmth: -0.10, shake: 0.03, meteors: 0.05, beacon: 1, exposure: 1.00 },
};
const KEYS = { '1': 'clear', '2': 'overcast', '3': 'storm', '4': 'clearing', '5': 'waiting' };
const CODE = { clear: 1, overcast: 2, storm: 3, clearing: 4, waiting: 5 };

/* ------------------------------ shaders ------------------------------ */
const VS = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FS_SCENE = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform vec2 uTanHalf;
uniform vec3 uSunDir;
uniform vec3 uSunScreen;        // x,y pixels (render res), z = visibility 0..1
uniform vec3 uRingN, uRingT, uRingB;
uniform vec4 uMoon;             // xyz centre, w radius
uniform float uTurb, uVortex, uLightning, uAurora, uHaze, uFlare, uMeteors, uBeacon, uNight, uStarGain;
uniform vec4 uShip[5];          // x, y (px), size, state code (0 = none)
uniform vec4 uShipB[5];         // phase, presence, activity, -

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
const mat3 ROT = mat3(0.00,0.80,0.60, -0.80,0.36,-0.48, -0.60,-0.48,0.64);
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a*noise3(p); p = ROT*p*2.07 + vec3(1.7,9.2,3.1); a *= 0.5; } return v; }
float fbm5(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*noise3(p); p = ROT*p*2.07 + vec3(1.7,9.2,3.1); a *= 0.5; } return v; }

float iSphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b*b - dot(oc, oc) + r*r;
  if (h < 0.0) return -1.0; h = sqrt(h); float t = -b - h; return t > 0.0 ? t : -1.0;
}

/* ---------- rings ---------- */
float ringCoarse(float r){                       // smooth profile (also used for the soft shadow on the planet)
  float base = smoothstep(1.30, 1.42, r)*smoothstep(2.36, 2.20, r);
  float gap = smoothstep(0.06, 0.0, abs(r-1.90));
  float broad = 0.50 + 0.50*noise3(vec3(r*7.0, 1.3, 2.7));
  return base*broad*(1.0 - 0.9*gap);
}
float ringDensity(float r){
  float fine = noise3(vec3(r*34.0, 1.3, 2.7))*0.6 + noise3(vec3(r*88.0, 5.1, 0.3))*0.4;
  fine = smoothstep(0.22, 0.78, fine);
  float gap = max(smoothstep(0.012, 0.0, abs(r-2.13))*0.85, smoothstep(0.02, 0.0, abs(r-1.63))*0.6);
  gap = max(gap, smoothstep(0.03, 0.0, abs(r-2.01))*0.35);
  float d = ringCoarse(r)*(0.22 + 0.78*fine)*(1.0 - gap);
  d += smoothstep(1.17, 1.21, r)*smoothstep(1.31, 1.27, r)*0.10*fine;      // faint inner ring
  return clamp(d, 0.0, 1.0);
}
// returns premultiplied colour, alpha in .a
vec4 shadeRing(vec3 h, float r, vec3 rd, float d){
  float tca = -dot(h, uSunDir); float sh = 1.0;                           // planet shadow on the ring
  if (tca > 0.0) { float dd = length(h + uSunDir*tca); sh = smoothstep(0.97, 1.08, dd); }
  float sameSide = step(0.0, dot(uRingN, uSunDir)*dot(uRingN, -rd));
  float lit = sh*(0.60 + 0.40*abs(dot(uRingN, uSunDir)))*mix(0.45, 1.0, sameSide);
  vec3 dust = mix(vec3(0.56,0.47,0.37), vec3(0.80,0.72,0.60), noise3(vec3(r*9.0, 0.5, 0.1)));
  vec3 col = dust*lit*1.10;
  float fwd = pow(max(0.0, dot(rd, uSunDir)), 6.0);
  col += vec3(1.0,0.88,0.72)*fwd*sh*(0.6 + 1.6*d*(1.0-d))*1.4;
  col += dust*vec3(0.05,0.06,0.09)*0.6;
  float a = d*0.80;                                                        // thin: what is behind shows through
  return vec4(col*a, a);
}

/* ---------- planet ---------- */
vec3 planetAlbedo(vec3 n, out float cloudH, out float spot){
  float lat = dot(n, uRingN); float x = dot(n, uRingT), z = dot(n, uRingB);
  float lon = atan(z, x) + uTime*0.012;
  // the great storm: an oval the bands flow around (no coordinate swirl)
  float lon0 = 0.9, lat0 = -0.30;
  float dl = atan(sin(lon-lon0), cos(lon-lon0)); float dlat = lat - lat0;
  float dist2 = dl*dl*1.1 + dlat*dlat*9.0;
  spot = smoothstep(0.040, 0.010, dist2);
  float lw = lat + dlat*exp(-dist2*14.0)*0.8;
  vec3 cyl = vec3(cos(lon), 0.0, sin(lon));
  float w = fbm3(vec3(cyl.x*2.2, lw*5.0, cyl.z*2.2) + vec3(0.0, 0.0, uTime*0.008));       // wavy band edges
  lw += (w-0.5)*(0.016 + 0.075*uTurb);
  float ed = fbm3(vec3(cyl.x*7.0, lw*26.0, cyl.z*7.0) + vec3(uTime*0.02, 0.0, 0.0));       // shear eddies at the edges
  lw += (ed-0.5)*(0.010 + 0.030*uTurb);
  // zonal bands: a 1-D profile in latitude, three widths
  float b = noise3(vec3(lw*8.0, 3.7, 1.1))*0.55 + noise3(vec3(lw*21.0, 8.2, 4.4))*0.30 + noise3(vec3(lw*52.0, 2.2, 9.1))*0.15;
  float streak = noise3(vec3(cyl.x*3.0, lw*75.0, cyl.z*3.0));
  cloudH = b;
  vec3 cream = vec3(0.70,0.62,0.52), ochre = vec3(0.60,0.44,0.31), rust = vec3(0.42,0.24,0.18), slate = vec3(0.24,0.27,0.33);
  vec3 col = mix(slate, ochre, smoothstep(0.30, 0.44, b));
  col = mix(col, cream, smoothstep(0.46, 0.56, b));
  col = mix(col, rust, smoothstep(0.60, 0.70, b)*0.7);
  col *= (0.88 + 0.24*streak)*(0.90 + 0.20*ed);
  col = mix(col, vec3(0.27,0.32,0.42), smoothstep(0.55, 0.95, abs(lat))*0.65);            // polar haze
  float sa = atan(dlat*3.0, dl) + sqrt(dist2)*(14.0 + 22.0*uVortex) - uTime*0.05;
  float sw = noise3(vec3(cos(sa)*2.0, sin(sa)*2.0, sqrt(dist2)*26.0));
  col = mix(col, vec3(0.66,0.38,0.27)*(0.78 + 0.44*sw), spot*(0.40 + 0.55*uVortex));
  return col;
}
vec3 shadePlanet(vec3 p, vec3 rd){
  vec3 n = p;
  float ch, spot; vec3 alb = planetAlbedo(n, ch, spot);
  float ndl = dot(n, uSunDir);
  float diff = smoothstep(-0.12, 0.45, ndl);
  // ring shadow on the planet
  float dn = dot(uSunDir, uRingN); float sh = 1.0;
  if (abs(dn) > 1e-3) { float t = -dot(p, uRingN)/dn; if (t > 0.0) { float r = length(p + uSunDir*t); sh = 1.0 - 0.55*ringCoarse(r); } }
  vec3 sun = vec3(1.0,0.93,0.82);
  vec3 col = alb*sun*diff*sh*0.88;
  float term = exp(-pow((ndl-0.02)*3.5, 2.0));                              // warm terminator
  col *= 1.0 + term*vec3(0.22, -0.02, -0.16);
  float night = 1.0 - diff;
  col += alb*vec3(0.06,0.08,0.13)*night*0.55;                              // starlight / ring shine
  float mu = max(0.0, dot(n, -rd));
  col *= 0.5 + 0.5*pow(mu, 0.6);                                              // limb darkening
  col += vec3(0.45,0.60,0.95)*pow(1.0-mu, 2.0)*diff*0.30;                     // blue scatter toward the limb
  float lu = dot(col, vec3(0.3,0.59,0.11)); col = mix(vec3(lu), col, 0.80);
  // lightning on the night side
  if (uLightning > 0.001) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i); float cyc = uTime*2.4 + fi*0.41; float seed = floor(cyc)*1.37 + fi*91.0; float ph = fract(cyc);
      vec2 h = hash21(seed); float on = step(h.y, uLightning*0.8);
      float lat0 = (h.x-0.5)*1.5; float lon0 = hash11(seed+3.0)*6.283; float cl = sqrt(max(0.0, 1.0-lat0*lat0));
      vec3 fp = uRingT*cos(lon0)*cl + uRingB*sin(lon0)*cl + uRingN*lat0;
      if (dot(fp, uSunDir) > -0.1) fp = reflect(fp, uSunDir);             // keep it on the night side
      float d = distance(n, fp); float pulse = exp(-ph*10.0)*(1.0 + 0.7*sin(ph*70.0 + fi));
      col += vec3(0.72,0.80,1.0)*on*pulse*exp(-d*d*110.0)*(0.4 + 1.2*ch)*night*1.8;
    }
  }
  // aurora ovals
  float al = abs(dot(n, uRingN)); float oval = exp(-pow((al-0.87)/0.045, 2.0));
  float lonA = atan(dot(n, uRingB), dot(n, uRingT));
  float curt = noise3(vec3(lonA*3.0, al*22.0, uTime*0.35))*0.7 + noise3(vec3(lonA*9.0, uTime*0.6, 2.0))*0.3;
  vec3 auroraCol = mix(vec3(0.15,0.90,0.55), vec3(0.60,0.30,0.95), smoothstep(0.85, 0.92, al));
  col += auroraCol*oval*curt*uAurora*(0.25 + 0.75*night)*1.1;
  // atmosphere rim
  float fres = pow(1.0 - max(0.0, dot(n, -rd)), 3.0);
  float sunFacing = smoothstep(-0.35, 0.45, ndl);
  vec3 rimCol = mix(vec3(0.25,0.45,0.95), vec3(1.0,0.62,0.30), sunFacing);
  col += rimCol*fres*(0.12 + 0.9*sunFacing)*0.9;
  float fwd = pow(max(0.0, dot(rd, uSunDir)), 10.0);
  col += vec3(1.0,0.82,0.62)*fres*fres*fwd*3.0;
  return col;
}
vec3 halo(vec3 ro, vec3 rd, float b, float tca){
  vec3 lp = normalize(ro + rd*tca); float ndl = dot(lp, uSunDir);
  float sunFacing = smoothstep(-0.35, 0.45, ndl);
  float g = exp(-(b-1.0)*26.0);
  vec3 c = mix(vec3(0.25,0.45,0.95), vec3(1.0,0.62,0.30), sunFacing)*(0.10 + 0.9*sunFacing)*0.95;
  float fwd = pow(max(0.0, dot(rd, uSunDir)), 10.0);
  float breathe = 1.0 + uBeacon*0.45*sin(uTime*1.7);
  c += vec3(1.0,0.86,0.66)*fwd*2.4*breathe;
  c *= g;
  c += vec3(0.95,0.78,0.60)*fwd*exp(-(b-1.0)*5.0)*0.45*breathe;           // wide corona glow
  return c;
}

/* ---------- moon ---------- */
float craters(vec3 n, float sc, float depth, float seed, float prob, float rimW){
  vec3 cell = floor(n*sc + seed); vec3 h = hash33(cell + seed*3.1);
  vec3 f = fract(n*sc + seed); vec3 ef = smoothstep(0.0, 0.2, f)*smoothstep(1.0, 0.8, f); float edge = ef.x*ef.y*ef.z;
  vec3 c = normalize((cell + 0.35 + 0.3*h - seed)/sc);
  float rad = (0.05 + 0.21*h.x*h.x)/sc;                                    // mostly small, a few large
  float d = distance(n, c)/rad;
  float bowl = -smoothstep(1.0, 0.15, d)*(0.4 + 0.6*h.y);
  float rim = 0.40*exp(-pow((d-1.0)*rimW, 2.0))*step(d, 1.8);
  return depth*(bowl + rim)*edge*step(h.z, prob);
}
float moonH(vec3 n){
  float h = fbm3(n*2.6)*0.75 + noise3(n*13.0)*0.10;                       // old, weathered terrain
  h += craters(n, 1.4, 0.75, 0.0, 0.85, 2.2) + craters(n, 3.2, 0.42, 2.0, 0.55, 2.8)
     + craters(n, 7.5, 0.24, 5.0, 0.55, 3.5) + craters(n, 17.0, 0.13, 9.0, 0.60, 3.5);
  return h;
}
vec3 toP0(vec3 p){ return normalize(-p); }
vec3 shadeMoon(vec3 p, vec3 rd){
  vec3 n = normalize(p - uMoon.xyz);
  vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0))); vec3 bb = cross(n, t);
  float e = 0.004; float h0 = moonH(n), hx = moonH(normalize(n + t*e)), hy = moonH(normalize(n + bb*e));
  vec3 nn = normalize(n - (t*(hx-h0) + bb*(hy-h0))*(0.05/e));
  float ndl = dot(nn, uSunDir);
  float diff = smoothstep(-0.03, 0.4, ndl)*smoothstep(-0.12, 0.05, dot(n, uSunDir));
  float maria = fbm3(n*1.9 + 4.0);
  vec3 alb = mix(vec3(0.095,0.09,0.09), vec3(0.165,0.15,0.135), smoothstep(0.35, 0.65, maria))*(0.75 + 0.5*clamp(h0, 0.0, 1.0));
  alb *= 0.90 + 0.20*noise3(n*70.0);                                       // grit
  vec3 col = alb*vec3(1.0,0.93,0.82)*diff*0.85;
  col += alb*vec3(0.9,0.8,0.65)*max(0.0, dot(nn, toP0(p)))*0.22*uBeacon;     // eclipse ring light
  float rimM = pow(1.0 - max(0.0, dot(n, -rd)), 5.0)*smoothstep(-0.3, 0.4, dot(n, uSunDir));
  col += vec3(1.0,0.85,0.65)*rimM*0.35;
  vec3 toP = normalize(-p);
  float litFrac = 0.5 + 0.5*dot(uSunDir, normalize(uMoon.xyz));           // how much of the planet's lit side faces the moon
  col += alb*vec3(0.85,0.60,0.42)*max(0.0, dot(nn, toP))*0.18*litFrac;    // planet shine
  col += alb*vec3(0.05,0.065,0.09)*0.5*(0.4 + 0.6*max(0.0, dot(nn, toP))); // sky
  return col;
}

/* ---------- sky ---------- */
vec3 starLayer(vec3 rd, float sc, float thr, float gain, float sig){
  vec3 cell = floor(rd*sc); vec3 h = hash33(cell);
  vec3 sp = normalize((cell + 0.2 + 0.6*h)/sc);
  float d = length(rd - sp);
  float bright = step(thr, h.x)*pow(h.y, 4.0);
  float tw = 1.0 + 0.3*sin(uTime*(2.0 + h.z*4.0) + h.z*40.0);
  vec3 tint = mix(vec3(1.0,0.78,0.60), vec3(0.72,0.82,1.0), h.z);
  return tint*exp(-d*d/(2.0*sig*sig))*bright*gain*tw;
}
vec3 sky(vec3 rd){
  float pix = 2.0*uTanHalf.y/uRes.y;
  vec3 c = starLayer(rd, 80.0, 0.975, 1.7, pix*0.85) + starLayer(rd, 190.0, 0.975, 0.45, pix*0.7);
  vec3 mwN = normalize(vec3(0.30, 0.75, -0.55));
  float band = exp(-pow(dot(rd, mwN)*3.2, 2.0));
  float neb = fbm3(rd*3.5 + 1.0);
  c += (vec3(0.33,0.28,0.38)*neb*neb*0.5 + vec3(0.18,0.22,0.36)*0.05)*band;
  return c*uStarGain;
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa - ba*h); }
vec3 meteors(vec2 uv){
  vec3 c = vec3(0.0); if (uMeteors < 0.01) return c;
  for (int i = 0; i < 3; i++) {
    float fi = float(i); float cyc = uTime*0.45 + fi*0.333; float seed = floor(cyc)*7.7 + fi*13.0; float ph = fract(cyc);
    vec2 h = hash21(seed); float on = step(h.y, 0.1 + 0.7*uMeteors);
    vec2 st = vec2(0.1 + 0.8*hash11(seed+5.0), 0.55 + 0.4*h.x);
    vec2 dir = normalize(vec2(0.6 + 0.6*hash11(seed+9.0), -0.3 - 0.5*hash11(seed+2.0)));
    float sp = 0.25*smoothstep(0.0, 0.08, ph)*smoothstep(0.45, 0.2, ph);
    vec2 head = st + dir*ph*0.9;
    float d = sdSeg(uv, head - dir*0.07, head);
    float along = clamp(dot(uv - head, -dir)/0.07, 0.0, 1.0);
    c += vec3(0.85,0.9,1.0)*exp(-d*d*2.5e5)*(1.0-along)*sp*on*4.0;
  }
  return c;
}
vec3 flare(vec2 frag){
  float vis = uSunScreen.z*uFlare; if (vis <= 0.0) return vec3(0.0);
  vec2 d = (frag - uSunScreen.xy)/uRes.y; float r = length(d);
  vec3 c = vec3(0.0);
  c += vec3(1.0,0.96,0.88)*(smoothstep(0.014, 0.009, r)*8.0 + 0.0022/(r*r + 0.0005));
  c += vec3(0.45,0.65,1.0)*exp(-abs(d.y)*120.0)*exp(-abs(d.x)*2.4)*0.9;    // anamorphic streak
  c += vec3(0.85,0.92,1.0)*exp(-abs(d.y)*420.0)*exp(-abs(d.x)*4.5)*0.7;
  c += vec3(1.0,0.75,0.5)*exp(-r*5.0)*0.25;                                 // warm veil
  vec2 cen = uRes*0.5/uRes.y, s = uSunScreen.xy/uRes.y, p = frag/uRes.y;
  for (int i = 0; i < 3; i++) {
    float f = -0.35 - float(i)*0.55; vec2 gp = cen + (s-cen)*f; float gr = 0.025 + float(i)*0.04; float dd = length(p-gp);
    c += vec3(0.30,0.5,0.9)*smoothstep(gr, gr-0.012, dd)*smoothstep(gr-0.035, gr-0.012, dd)*0.04*smoothstep(0.65, 0.95, uFlare);
  }
  return c*vis;
}

/* ---------- ships (sessions) ---------- */
float sdBox(vec2 p, vec2 c, vec2 b){ vec2 d = abs(p-c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdShip(vec2 p){
  vec2 q = p; q.y /= 1.0 - 0.55*smoothstep(0.8, 4.2, p.x);                // tapered nose
  float hull = length(q - vec2(clamp(q.x, -3.0, 3.6), 0.0)) - 0.62;
  float d = min(hull, sdBox(p, vec2(-0.9, 0.85), vec2(0.95, 0.38)));      // bridge
  d = min(d, sdBox(p, vec2(-3.3, 0.0), vec2(0.65, 0.95)));                // engine block
  d = min(d, sdBox(p, vec2(-0.5, 1.75), vec2(0.07, 0.55)));               // mast
  d = min(d, sdBox(p, vec2(0.9, -0.85), vec2(0.6, 0.22)));                // keel pod
  return d;
}
vec3 ships(vec2 frag, vec3 col){
  for (int i = 0; i < 5; i++) {
    vec4 s = uShip[i]; float pres = uShipB[i].y; if (s.w < 0.5 || pres <= 0.001) continue;
    vec2 p = (frag - s.xy)/s.z;
    if (abs(p.y) > 14.0) continue;
    float code = s.w; float t = uTime + uShipB[i].x; float act = uShipB[i].z;
    float aa = 0.5/s.z + 0.15;
    float hull = 0.0, rimSun = 0.0, rimFill = 0.0;
    if (abs(p.x) < 6.0 && abs(p.y) < 4.0) {
      hull = smoothstep(aa, -aa, sdShip(p));
      vec2 ls = normalize(uSunScreen.xy - s.xy + vec2(0.01, 0.01));
      rimSun = clamp(hull - smoothstep(aa, -aa, sdShip(p + ls*0.45)), 0.0, 1.0)*uSunScreen.z;     // edge facing the star
      rimFill = clamp(hull - smoothstep(aa, -aa, sdShip(p + vec2(0.30, 0.33))), 0.0, 1.0);        // planet shine
    }
    vec3 hullCol = vec3(0.020,0.022,0.027) + vec3(0.95,0.80,0.62)*rimSun*0.85 + vec3(0.40,0.36,0.34)*rimFill*0.22;
    vec3 lc; float blink = 1.0; float plume = 0.0;
    if (code < 1.5)      { lc = vec3(1.0,0.95,0.85); blink = 0.85 + 0.15*sin(t*2.0); }
    else if (code < 2.5) { lc = vec3(1.0,0.62,0.22); blink = 0.25 + 0.75*(0.5 + 0.5*sin(t*1.7)); }
    else if (code < 3.5) { lc = vec3(0.55,0.85,1.0); plume = 1.0; blink = 0.9 + 0.1*sin(t*17.0); }
    else if (code < 4.5) { lc = vec3(1.0,0.72,0.42); plume = 0.3; }
    else { lc = vec3(1.0,0.22,0.12); float f = fract(t*0.7); blink = (step(f, 0.07) + step(0.14, f)*step(f, 0.21))*1.6; }
    vec2 lp = p - vec2(-0.5, 2.4); float dn = length(lp);                  // the light sits on the mast
    float glow = exp(-dn*dn*0.4)*3.5 + 0.18/(dn*dn*0.12 + 0.06);
    float glint = exp(-abs(lp.y)*2.6)*exp(-abs(lp.x)*0.24)*0.6;
    vec3 add = lc*blink*(glow + glint);
    if (plume > 0.0) {
      vec2 e = p - vec2(-4.2, 0.0); float fl = 0.75 + 0.25*sin(t*23.0) + 0.15*sin(t*41.0); float along = max(-e.x, 0.0);
      float pl = exp(-e.y*e.y*(1.4 + along*0.05))*exp(-along*0.09)*step(e.x, 0.3)*(0.6 + 0.4*act);
      add += vec3(0.5,0.8,1.0)*pl*plume*fl*1.4 + vec3(0.9,0.95,1.0)*exp(-dot(e,e)*0.7)*plume*fl*1.5;
    }
    col = mix(col, hullCol, hull*pres) + add*pres;
  }
  return col;
}

void main(){
  vec2 frag = gl_FragCoord.xy; vec2 uv = frag/uRes; vec2 ndc = uv*2.0 - 1.0;
  vec3 rd = normalize(uCamF + uCamR*ndc.x*uTanHalf.x + uCamU*ndc.y*uTanHalf.y);
  vec3 ro = uCamPos;
  float tP = iSphere(ro, rd, vec3(0.0), 1.0);
  float tM = iSphere(ro, rd, uMoon.xyz, uMoon.w);
  float tR = -1.0; float dn = dot(rd, uRingN);
  if (abs(dn) > 1e-4) { float t = -dot(ro, uRingN)/dn; if (t > 0.0) tR = t; }
  vec4 ring = vec4(0.0);
  if (tR > 0.0) { vec3 h = ro + rd*tR; float r = length(h); if (r > 1.15 && r < 2.4) { float d = ringDensity(r); if (d > 0.002) ring = shadeRing(h, r, rd, d); } }
  float tca = -dot(ro, rd); float b = sqrt(max(dot(ro, ro) - tca*tca, 0.0));
  vec3 col;
  if (tP > 0.0) {
    col = shadePlanet(ro + rd*tP, rd);
    if (tR > 0.0 && tR < tP) col = col*(1.0-ring.a) + ring.rgb;
  } else {
    col = sky(rd) + meteors(vec2(uv.x*uRes.x/uRes.y, uv.y));
    vec3 hl = (tca > 0.0 && b < 1.6) ? halo(ro, rd, b, tca) : vec3(0.0);
    if (tR > 0.0 && tR > tca) { col = col*(1.0-ring.a) + ring.rgb; col += hl; }     // ring behind the atmosphere
    else { col += hl; if (tR > 0.0) col = col*(1.0-ring.a) + ring.rgb; }
  }
  // moon in front of everything it covers, with an anti-aliased limb
  float tcm = dot(uMoon.xyz - ro, rd);
  if (tcm > 0.0) {
    vec3 cp = ro + rd*tcm - uMoon.xyz; float dmc = length(cp); vec3 lp = cp/dmc;
    float wpx = tcm*2.0*uTanHalf.y/uRes.y*1.3;
    float cov = (tP < 0.0 || tcm < tP) ? smoothstep(uMoon.w + wpx, uMoon.w - wpx, dmc) : 0.0;
    float lit = smoothstep(-0.25, 0.35, dot(lp, uSunDir));
    float hz = exp(-max(dmc - uMoon.w, 0.0)*5.0)*uHaze;
    col += mix(vec3(0.20,0.22,0.28), vec3(0.80,0.66,0.52), lit)*hz*(0.15 + 0.55*lit)*uSunScreen.z + vec3(0.15,0.17,0.22)*hz*0.10;
    if (cov > 0.0) { vec3 pm = tM > 0.0 ? ro + rd*tM : uMoon.xyz + lp*uMoon.w; col = mix(col, shadeMoon(pm, rd), cov); }
  }
  col += flare(frag);
  col = ships(frag, col);
  col = max(col, 0.0);
  gl_FragColor = vec4(col/(1.0 + col), 1.0);
}`;

const FS_POST = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexRes;
uniform float uTime, uExposure, uWarmth, uNight;
vec3 dec(vec3 c){ c = min(c, vec3(0.996)); return c/(1.0 - c); }
vec3 tex(vec2 uv){ return dec(texture2D(uTex, uv).rgb); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; vec2 d = uv - 0.5; d.x *= uRes.x/uRes.y; float r2 = dot(d, d);
  vec2 off = d*r2*0.0035;
  vec3 c = vec3(tex(uv + off).r, tex(uv).g, tex(uv - off).b);
  // soft bloom from the half-res scene
  vec3 bl = vec3(0.0); vec2 px = 1.0/uTexRes;
  for (int i = 0; i < 8; i++) { float a = float(i)*0.785398 + 0.3; vec2 o = vec2(cos(a), sin(a)); bl += tex(uv + o*px*(5.0 + 5.0*mod(float(i), 2.0))); }
  bl /= 8.0;
  c += max(bl - 0.4, 0.0)*0.45;
  c *= uExposure*(1.0 - 0.22*uNight);
  c = aces(c);
  // split toning: teal shadows, warm highlights; warmth slides the whole frame
  float lum = dot(c, vec3(0.30, 0.59, 0.11));
  vec3 shadow = vec3(0.90, 0.99, 1.10), high = vec3(1.08, 1.00, 0.90);
  c *= mix(shadow, high, smoothstep(0.05, 0.75, lum));
  c *= vec3(1.0 + 0.07*uWarmth, 1.0 + 0.01*uWarmth, 1.0 - 0.09*uWarmth);
  c = mix(c, c*c*(3.0 - 2.0*c), 0.22);                                        // gentle S-curve
  c = c*0.97 + 0.015;                                                          // lifted film black
  c *= 1.0 - 0.55*smoothstep(0.25, 1.35, r2*1.6);                              // vignette
  float g = hash12(gl_FragCoord.xy + fract(uTime*7.0)*vec2(97.0, 31.0)) - 0.5;
  c += g*0.040*(1.0 - lum*0.5);
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

/* ------------------------------ sessions → ships ------------------------------ */
let slots = [null, null, null, null, null], sources = [];
const ships = Array.from({ length: 5 }, (_, i) => ({ st: null, code: 0, fade: 0, phase: i*1.73 + 0.4, activity: 0 }));
let evOk = null, ev = null, lastLatency = 0;
function applySessions(list) {
  const nxt = (list || []).slice(0, 5); while (nxt.length < 5) nxt.push(null);
  nxt.forEach((st, i) => { if (st && STATES[st]) { ships[i].st = st; ships[i].code = CODE[st]; } else ships[i].st = null; });
  slots = nxt;
}
async function pollState() {
  const t0 = performance.now();
  try { const r = await fetch('state.json', { cache: 'no-store' }); lastLatency = performance.now() - t0; if (r.ok) applyState(await r.json()); } catch (e) {}
  try {
    const r = await fetch('events.json', { cache: 'no-store' });
    if (r.ok) { ev = await r.json(); evOk = true; } else evOk = false;
  } catch (e) { evOk = false; }
  // activity per slot: events in the last 12 s (events.json), else from state only
  const now = ev && ev.now || Date.now(); const act = [0, 0, 0, 0, 0];
  if (evOk && ev && Array.isArray(ev.recent)) for (const e of ev.recent) if (e && e.slot >= 0 && e.slot < 5 && now - e.t < 12000) act[e.slot] += 0.25;
  ships.forEach((s, i) => { s.activity = evOk ? Math.min(1, act[i]) : (s.st === 'storm' ? 0.7 : 0.2); });
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
  scene = program(FS_SCENE); post = program(FS_POST);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  for (const pr of [scene, post]) { const a = gl.getAttribLocation(pr.p, 'aP'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  fbo = gl.createFramebuffer();
  glOk = true;
} catch (e) { errors.push(String(e.message || e)); }

function resize() {
  const dpr = Math.min(1, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(innerWidth*dpr)), h = Math.max(2, Math.round(innerHeight*dpr));
  if (w === W && h === H) return;
  W = w; H = h; cv.width = w; cv.height = h;
  SW = Math.max(2, Math.round(w*CONFIG.scale)); SH = Math.max(2, Math.round(h*CONFIG.scale));
  if (!glOk) return;
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SW, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ------------------------------ camera / world ------------------------------ */
const v = {
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  cross: (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]],
  dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  add: (a, b, s = 1) => [a[0] + b[0]*s, a[1] + b[1]*s, a[2] + b[2]*s],
  scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
};
const CAM_POS = [0.0, 0.6, 4.7];
const RING_N = v.norm([0.36, 1.0, 0.20]);
const RING_T = v.norm(v.cross(RING_N, [0, 0, 1]));
const RING_B = v.cross(RING_N, RING_T);
const FOV_V = 23*Math.PI/180;                       // vertical half fov
const Dp = v.norm(v.scale(CAM_POS, -1));            // camera → planet centre
const R0 = v.norm(v.cross(Dp, [0, 1, 0])), U0 = v.cross(R0, Dp);
const MOON_R = 1.5;
const MOON_POS = v.add(v.add(v.add(CAM_POS, Dp, 2.7), U0, -1.95), R0, 0.3);
function nightness() {
  const d = new Date(), h = CONFIG.clockHours ?? d.getHours() + d.getMinutes()/60;
  const ss = x => { x = Math.min(1, Math.max(0, x)); return x*x*(3 - 2*x); };
  return h >= 12 ? ss((h - 17.5)/2) : 1 - ss((h - 5)/2);
}
const frame = { time: 0, night: 0, sunDir: [0, 0, 1], sunScr: [0, 0, 0], F: Dp, R: R0, U: U0, tanH: 1, tanV: 1 };
function updateCamera(T) {
  // locked-off camera: no shake, no drift (user, 2026-11-10)
  const yaw = -13*Math.PI/180;
  const pitch = -7*Math.PI/180;
  let F = v.norm(v.add(v.add(Dp, R0, Math.tan(yaw)), U0, Math.tan(pitch)));
  const R = v.norm(v.cross(F, [0, 1, 0])), U = v.cross(R, F);
  frame.F = F; frame.R = R; frame.U = U;
  frame.tanV = Math.tan(FOV_V); frame.tanH = frame.tanV*SW/SH;
  // star: angle from the planet centre, azimuth 165° (left, a little up)
  const a = current.sunAngle*(1 - 0.25*frame.night)*Math.PI/180, phi = 165*Math.PI/180;
  const side = v.add(v.scale(R0, Math.cos(phi)), U0, Math.sin(phi));
  const sun = v.norm(v.add(v.scale(Dp, Math.cos(a)), side, Math.sin(a)));
  frame.sunDir = sun;
  const litK = Math.min(1, Math.max(0, (a*180/Math.PI - 18)/75)); frame.starGain = (1 - 0.72*litK*litK*(3 - 2*litK))*(0.75 + 0.45*frame.night);
  // sun on screen + visibility (planet / moon occlusion)
  const df = v.dot(sun, F); let vis = 0, sx = -1e4, sy = -1e4;
  if (df > 0.02) {
    sx = (v.dot(sun, R)/df/frame.tanH*0.5 + 0.5)*SW; sy = (v.dot(sun, U)/df/frame.tanV*0.5 + 0.5)*SH;
    const rhoP = Math.asin(1/Math.hypot(...CAM_POS)), angP = Math.acos(Math.max(-1, Math.min(1, v.dot(sun, Dp))));
    const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
    vis = sm(angP, rhoP - 0.006, rhoP + 0.03);
    const dm = v.add(MOON_POS, CAM_POS, -1), distM = Math.hypot(...dm), rhoM = Math.asin(MOON_R/distM), angM = Math.acos(Math.max(-1, Math.min(1, v.dot(sun, v.scale(dm, 1/distM)))));
    vis *= sm(angM, rhoM - 0.006, rhoM + 0.03);
  }
  frame.sunScr = [sx, sy, vis];
}

/* ------------------------------ render ------------------------------ */
const shipA = new Float32Array(20), shipB = new Float32Array(20);
let fps = 30, frameMs = 0, T = 0, last = 0, paused = false;
function render(T) {
  if (!glOk) return;
  const now = performance.now()/1000;
  tickParams(now);
  frame.night = nightness();
  updateCamera(T);
  // ships: a loose convoy above the moon's horizon, drifting right
  const px = SH/540;
  const sizes = [1.0, 0.82, 1.18, 0.9, 1.06];
  for (let i = 0; i < 5; i++) {
    const s = ships[i];
    const target = s.st ? 1 : 0; s.fade += (target - s.fade)*Math.min(1, 1/CONFIG.fps/1.6);
    const x = 0.065 + i*0.098 + 0.010*Math.sin(T*0.07 + i*1.3) + 0.004*Math.sin(T*0.9 + i);
    const y = 0.33 + 0.035*Math.sin((x - 0.05)*4.0 + 1.0) + 0.006*Math.sin(T*0.5 + i*2.0);
    shipA[i*4] = x*SW; shipA[i*4 + 1] = y*SH; shipA[i*4 + 2] = sizes[i]*px*2.7; shipA[i*4 + 3] = s.fade > 0.001 ? s.code : 0;
    shipB[i*4] = s.phase; shipB[i*4 + 1] = s.fade; shipB[i*4 + 2] = s.activity; shipB[i*4 + 3] = 0;
  }
  // pass 1: scene at half res
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SW, SH);
  gl.useProgram(scene.p); const u = scene.u;
  gl.uniform2f(u.uRes, SW, SH); gl.uniform1f(u.uTime, T);
  gl.uniform3fv(u.uCamPos, CAM_POS); gl.uniform3fv(u.uCamF, frame.F); gl.uniform3fv(u.uCamR, frame.R); gl.uniform3fv(u.uCamU, frame.U);
  gl.uniform2f(u.uTanHalf, frame.tanH, frame.tanV);
  gl.uniform3fv(u.uSunDir, frame.sunDir); gl.uniform3fv(u.uSunScreen, frame.sunScr);
  gl.uniform3fv(u.uRingN, RING_N); gl.uniform3fv(u.uRingT, RING_T); gl.uniform3fv(u.uRingB, RING_B);
  gl.uniform4f(u.uMoon, MOON_POS[0], MOON_POS[1], MOON_POS[2], MOON_R);
  gl.uniform1f(u.uTurb, current.turbulence); gl.uniform1f(u.uVortex, current.vortex); gl.uniform1f(u.uLightning, current.lightning);
  gl.uniform1f(u.uAurora, current.aurora); gl.uniform1f(u.uHaze, current.haze); gl.uniform1f(u.uFlare, current.flare);
  gl.uniform1f(u.uMeteors, current.meteors); gl.uniform1f(u.uBeacon, current.beacon); gl.uniform1f(u.uNight, frame.night); gl.uniform1f(u.uStarGain, frame.starGain);
  gl.uniform4fv(u.uShip, shipA); gl.uniform4fv(u.uShipB, shipB);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // pass 2: post at full res
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  gl.useProgram(post.p); const q = post.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(q.uTex, 0);
  gl.uniform2f(q.uRes, W, H); gl.uniform2f(q.uTexRes, SW, SH); gl.uniform1f(q.uTime, T);
  gl.uniform1f(q.uExposure, current.exposure); gl.uniform1f(q.uWarmth, current.warmth); gl.uniform1f(q.uNight, frame.night);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function loop(now) {
  if (paused || document.hidden) return;
  requestAnimationFrame(loop);
  if (now - last < 1000/CONFIG.fps - 1) return;
  const dt = Math.min(0.1, (now - last)/1000 || 1/30); last = now; T += dt;
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
  L.push(`planet-fable · state ${stateName}${pending ? ' → ' + pending : ''} · ${(now/1000 - stateAt).toFixed(0)} s · bridge ${lastLatency.toFixed(0)} ms · events.json ${evOk === null ? '…' : evOk ? 'ok' : 'missing'}`);
  L.push('slots  ' + slots.map((s, i) => `${i}:${s || '—'}${ships[i].activity ? '(' + ships[i].activity.toFixed(1) + ')' : ''}`).join('  '));
  L.push('params ' + Object.keys(PARAMS).map(p => `${p} ${current[p].toFixed(2)}`).join(' · '));
  L.push(`sun ${frame.sunScr[0].toFixed(0)},${frame.sunScr[1].toFixed(0)} vis ${frame.sunScr[2].toFixed(2)} · night ${frame.night.toFixed(2)} ${CONFIG.clockHours != null ? 'clock ' + CONFIG.clockHours : 'real clock'}`);
  L.push(`render ${fps.toFixed(0)} fps · ${frameMs.toFixed(1)} ms cpu · scene ${SW}×${SH} → ${W}×${H}`);
  if (errors.length) L.push('errors: ' + errors.join(' | '));
  dbg.textContent = L.join('\n');
}

/* ------------------------------ testing hooks (demo.html) ------------------------------ */
window.theme = {
  requestState, applyState, STATES, PARAMS, CONFIG,
  setOverride(o) { override = o; },
  jump(name) { if (!STATES[name]) return; clearTimeout(debounceT); pending = null; applyState(name); tDur = 0; for (const p in PARAMS) current[p] = to[p]; },
  setSessions(a) { applySessions(a); },
  get current() { return { ...current }; }, get state() { return stateName; }, get sessions() { return slots.slice(); },
  // render one frame now and return it (used to make preview.jpg)
  snapshot(type = 'image/jpeg', quality = 0.92) { resize(); render(T); return cv.toDataURL(type, quality); },
  renderOnce() { resize(); render(T); gl && gl.finish(); },
  errors,
};

(async () => {
  resize(); await pollState();
  clearTimeout(debounceT); if (pending) { applyState(pending); pending = null; }
  for (const p in PARAMS) current[p] = to[p];                         // start on the polled state, no fade-in
  setInterval(() => { if (CONFIG.polling && !paused && !document.hidden) pollState(); }, 1000);
  last = performance.now(); requestAnimationFrame(loop);
})();
