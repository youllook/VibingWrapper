// 大海怪2 water: dark open ocean seen from high up. Unshaded, everything by hand:
// the swell (Gerstner waves, from themes/_lib/sea3d) → rippled normals (a ripple map sampled in five sliding layers,
// roughened in patches by two gust fields, as sea3d) → refraction of what is below (the squid; not the boat's own hull)
// → colour absorbed along the path through the water → sea3d's sky mirrored by Fresnel and its Beckmann sun glint
// → the boat's wake foam.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform sampler2D ripple : filter_linear_mipmap, repeat_enable;   // textures/ripple.png (tools/make_ripple.py): RG = slope/rms/8+.5

uniform float time = 0.0;
uniform vec2 drift = vec2(0.0);           // metres the water has slid past the (stationary) boat
uniform vec3 sun_dir = vec3(0.6, -0.5, 0.5);
uniform vec2 boat_pos = vec2(0.0);
uniform vec2 boat_dir = vec2(1.0, 0.0);
uniform float calm = 0.0;                 // 1 while the squid is up: the sea goes quiet and the water over it clears
uniform float murk = 0.0;                 // 0 bright blue at rest … 1 blue-black while Claude works
uniform float swell = 1.0;                // how much of the swell plays (it settles over the squid)
uniform vec4 wa[10];                      // per wave: direction x, z; wavenumber; amplitude (main.gd builds them)
uniform vec4 wb[10];                      // per wave: Gerstner q; angular speed; phase

// deep water / in-scatter, at rest and murky
uniform vec3 deep_clear = vec3(0.016, 0.068, 0.140);
uniform vec3 deep_murk = vec3(0.006, 0.026, 0.055);
uniform vec3 scatter_clear = vec3(0.014, 0.075, 0.130);
uniform vec3 scatter_murk = vec3(0.007, 0.032, 0.060);
uniform vec3 absorb = vec3(0.16, 0.06, 0.045);   // per metre: red goes first
uniform vec3 sky_h = vec3(0.42, 0.56, 0.70);   // sea3d's sky, horizon and zenith
uniform vec3 sky_z = vec3(0.10, 0.24, 0.44);
uniform vec2 glint = vec2(0.0008, 0.9);         // sun glint: base roughness, strength

varying vec3 wpos;
varying vec3 swell_n;
varying float crest;

// the swell, as sea3d: each wave moves the grid round a circle (q sharpens the crests), normals analytically.
// The grid stays on the boat (only translated), the waves are laid on the drifting water
void vertex() {
	vec3 p = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 q = p.xz + drift;
	vec3 d = vec3(0.0), n = vec3(0.0, 1.0, 0.0);
	float cr = 0.0;
	for (int i = 0; i < 10; i++) {
		vec4 A = wa[i], B = wb[i];
		float th = A.z * dot(A.xy, q) - B.y * time + B.z, c = cos(th), s = sin(th);
		d += vec3(B.x * A.w * A.x * c, A.w * s, B.x * A.w * A.y * c);
		float ka = A.z * A.w;
		n -= vec3(A.x * ka * c, B.x * ka * s, A.y * ka * c);
		cr += B.x * ka * s;
	}
	d *= swell;
	VERTEX += d;
	wpos = p + d;
	swell_n = vec3(n.x * swell, 1.0 - (1.0 - n.y) * swell, n.z * swell);
	crest = cr * swell;
}

// hash without sine (Dave Hoskins): the sin() one falls apart into blocks on WebGL
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float a = 0.5, s = 0.0;
	for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = mat2(vec2(1.6, 1.2), vec2(-1.2, 1.6)) * p; a *= 0.5; }
	return s;
}

// surface slope: the ripple map sampled once per layer, each layer its own tile size (m), drift (m/s), rms slope and
// rotation, so the layers slide across each other and the interference keeps changing (2026-10-27: replaces three
// evaluations of 12-octave noise per pixel, which cost ~27 ms a frame on the UHD 630)
const int NL = 5;
const vec4 RIP_A[NL] = vec4[](vec4(43.0, 0.45, 0.55, 0.06), vec4(21.0, -0.32, 0.68, 0.08), vec4(10.0, 0.58, 0.22, 0.10),
	vec4(5.0, -0.18, 0.50, 0.12), vec4(2.5, 0.27, -0.14, 0.12));
const float RIP_ROT[NL] = float[](0.0, 0.6, -0.5, 1.2, -1.4);
const float RIP_GUST[NL] = float[](0.0, 0.3, 0.7, 1.0, 1.0);   // sea3d: the finer the layer, the more the gusts rule it
// two gust fields drift downwind; where they blow the fine layers roughen, elsewhere they lie flat (cat's paws).
// lost = the slope variance of layers finer than the pixel, which widens the sun's glint into a sheen (sea3d)
vec2 wave_slope(vec2 p, float fw, out float lost) {
	vec2 wind = vec2(0.6, -0.8);
	float gA = smoothstep(0.15, 0.85, vnoise(p * 0.045 - wind * time * 0.4));
	float gB = smoothstep(0.15, 0.85, vnoise(p * 0.11 + 3.3 - wind * time * 0.6));
	vec2 g = vec2(0.0);
	lost = 0.0;
	for (int i = 0; i < NL; i++) {
		vec4 A = RIP_A[i];
		float rms = A.w * mix(1.0, 0.25 + 1.5 * mix(gA, gB, float(i % 2)), RIP_GUST[i]);
		float keep = smoothstep(2.0, 10.0, A.x / (16.0 * fw));
		lost += (1.0 - keep) * rms * rms;
		vec2 cs = vec2(cos(RIP_ROT[i]), sin(RIP_ROT[i]));
		vec2 q = vec2(cs.x * p.x - cs.y * p.y, cs.y * p.x + cs.x * p.y);
		vec2 sl = (texture(ripple, (q + A.yz * time) / A.x).rg - 0.5) * 8.0 * rms * keep;
		g += vec2(cs.x * sl.x + cs.y * sl.y, -cs.y * sl.x + cs.x * sl.y);   // back to the world's axes
	}
	return g * (1.0 - 0.75 * calm);
}
// the world point behind a screen position, from the depth buffer
vec3 world_at(vec2 uv, float dz, mat4 inv_proj, mat4 inv_view) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(uv, dz) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(uv * 2.0 - 1.0, dz);
#endif
	vec4 vp = inv_proj * vec4(ndc, 1.0);
	return (inv_view * vec4(vp.xyz / vp.w, 1.0)).xyz;
}
vec3 sky(vec3 d, vec3 L) {
	vec3 c = mix(sky_h, sky_z, pow(clamp(d.y, 0.0, 1.0), 0.5));
	float sd = max(dot(d, L), 0.0);
	return c + vec3(1.0, 0.93, 0.8) * (pow(sd, 8.0) * 0.25 + pow(sd, 900.0) * 40.0);
}

void fragment() {
	// no water inside the hull (user 2026-10-27: the boat looked flooded — its deck sits below the flat water plane):
	// the 5 m × 1.85 m footprint, the bow tapering over its front 1.9 m, inset so the hull's outside still meets the sea
	// Only where the hull itself is behind: when the boat rolls on the swell the footprint and the hull part, and the
	// hole showed straight down to the squid 60 m below, red and unabsorbed — the boat looked on fire (user 2026-10-27)
	vec2 bd = wpos.xz - boat_pos;
	float bu = dot(bd, boat_dir), bv = dot(bd, vec2(-boat_dir.y, boat_dir.x));
	float half_beam = 0.80 * sqrt(clamp((2.45 - bu) / 1.9, 0.0, 1.0));
	if (bu > -2.35 && bu < 2.45 && abs(bv) < half_beam && world_at(SCREEN_UV, texture(depth_tex, SCREEN_UV).r, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX).y > wpos.y - 1.5) { discard; }
	vec2 p = wpos.xz + drift;
	float lost;
	vec2 g = wave_slope(p, length(fwidth(wpos.xz)), lost);
	vec3 n = normalize(normalize(swell_n) + vec3(-g.x, 0.0, -g.y));
	vec3 V = normalize(CAMERA_POSITION_WORLD - wpos);

	// what is below: refracted screen sample, and how far the light travels through the water to reach it
	vec2 ruv = SCREEN_UV + n.xz * 0.025;
	vec3 below_w = world_at(ruv, texture(depth_tex, ruv).r, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
	if (below_w.y > wpos.y) {   // refraction picked something above the water (the hull): don't — and measure the depth
		ruv = SCREEN_UV;        // straight below too, or the squid 60 m down came through unabsorbed, red round the hull
		below_w = world_at(ruv, texture(depth_tex, ruv).r, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
	}
	float depth_below = max(0.0, wpos.y - below_w.y);
	vec3 seen = texture(screen_tex, ruv).rgb;   // no mip blur: the web build has no mipmaps on the screen copy
	float path = depth_below * (1.0 + 1.0 / max(V.y, 0.2)) * 0.5 + depth_below;   // down and back up, roughly
	vec3 deep_col = mix(deep_clear, deep_murk, murk);
	vec3 scatter_col = mix(scatter_clear, scatter_murk, murk);
	float clear_here = calm * (1.0 - smoothstep(14.0, 26.0, depth_below));   // only the top ~20 m clears
	vec3 trans = exp(-absorb * (1.0 - 0.6 * clear_here) * path);
	vec3 col = seen * trans + scatter_col * (1.0 - exp(-0.08 * path)) * (1.0 - trans.g * 0.5);
	col = mix(deep_col, col, clamp(trans.b * 1.25, 0.0, 1.0));
	// something big below shades the water over it (mood over optics): while the squid is deep it reads as a dark
	// mass, not as nothing; near the surface its own colour takes over
	float shade = smoothstep(2.0, 7.0, depth_below) * (1.0 - smoothstep(45.0, 58.0, depth_below));
	col *= 1.0 - 0.7 * shade * (1.0 - clear_here);   // gone once it is up: then the water over it clears instead
	// big slow patches of darker / lighter water
	col *= 0.8 + 0.4 * vnoise(p * 0.02 + time * 0.005);

	// surface, as sea3d: the sky mirrored by Fresnel, a crest facing the sun lets a little green through, and the sun's
	// glint as a Beckmann lobe that the unresolved ripple slope widens (sparkle near, sheen far)
	vec3 L = -normalize(sun_dir);
	float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
	float dim = mix(1.0, 0.4, murk);
	float thin = clamp(crest * 1.5, 0.0, 1.0) * max(dot(-V, L) * 0.5 + 0.5, 0.0);
	col += vec3(0.0, 0.05, 0.05) * thin * dim;
	col = mix(col, sky(reflect(-V, n), L) * dim, fres);
	vec3 H = normalize(V + L);
	float nh = max(dot(n, H), 0.0), m2 = glint.x + lost;
	float D = exp((nh * nh - 1.0) / (m2 * nh * nh)) / (3.1416 * m2 * pow(nh, 4.0) + 1e-4);
	col += vec3(1.0, 0.95, 0.85) * D * fres * glint.y * (1.0 - 0.6 * calm) * (1.0 - 0.55 * murk);

	// wake: thin broken foam along the arms of the V, a faint turquoise propwash down the middle
	// (the thick white core band was taken out, user 2026-10-27)
	vec2 d = wpos.xz - boat_pos;
	vec2 perp = vec2(-boat_dir.y, boat_dir.x);
	float s = -dot(d, boat_dir) - 2.8;             // metres behind the transom
	float x = dot(d, perp);
	if (s > -0.5 && s < 150.0 && abs(x) < 3.0 + s * 0.32) {   // only inside the V
		float w = 0.45 + 0.055 * s;
		float core = 1.0 - smoothstep(0.2 * w, w, abs(x + 0.4 * sin(s * 0.25 + time)));
		float arms = 1.0 - smoothstep(0.0, 0.6 + 0.04 * s, abs(abs(x) - s * 0.26));
		float age = exp(-s / 28.0) * smoothstep(-0.5, 1.0, s);
		float fn = fbm(p * 1.1 + vec2(0.0, time * 0.4));
		float fn2 = vnoise(p * 4.0 - time * 0.6);
		float foam = arms * 0.5 * smoothstep(0.55, 0.85, fn + 0.3 * fn2) * exp(-s / 30.0);
		col = mix(col, vec3(0.85, 0.9, 0.92), clamp(foam * age * 1.4, 0.0, 0.95));
		col += vec3(0.0, 0.035, 0.045) * core * age;
	}

	ALBEDO = col;
	ALPHA = 1.0;
}
