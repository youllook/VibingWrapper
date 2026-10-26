// 大海怪2 water: dark open ocean seen from high up. Unshaded, everything by hand:
// rippled normals → refraction of what is below (the squid, the boat's hull) → colour absorbed along the path
// through the water → sky reflection + sun glitter → the boat's wake foam.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;

uniform float time = 0.0;
uniform vec2 drift = vec2(0.0);           // metres the water has slid past the (stationary) boat
uniform vec3 sun_dir = vec3(0.6, -0.5, 0.5);
uniform vec2 boat_pos = vec2(0.0);
uniform vec2 boat_dir = vec2(1.0, 0.0);
uniform float calm = 0.0;                 // 1 while the squid is up: the sea goes quiet and the water over it clears
uniform float murk = 0.0;                 // 0 bright blue at rest … 1 blue-black while Claude works

// deep water / in-scatter, at rest and murky
uniform vec3 deep_clear = vec3(0.016, 0.068, 0.140);
uniform vec3 deep_murk = vec3(0.006, 0.026, 0.055);
uniform vec3 scatter_clear = vec3(0.014, 0.075, 0.130);
uniform vec3 scatter_murk = vec3(0.007, 0.032, 0.060);
uniform vec3 absorb = vec3(0.16, 0.06, 0.045);   // per metre: red goes first
uniform vec3 sky_col = vec3(0.42, 0.56, 0.72);

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
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

// sea height (metres): a few swells + choppy noise, all moving with the water
float sea(vec2 p) {
	float q = 1.0 - 0.75 * calm;
	float h = 0.0;
	h += 0.30 * sin(dot(p, vec2(0.11, 0.05)) - time * 0.9);
	h += 0.18 * sin(dot(p, vec2(-0.07, 0.13)) - time * 1.1);
	h += 0.10 * sin(dot(p, vec2(0.21, -0.17)) - time * 1.6);
	h += 0.22 * fbm(p * 0.35 + vec2(time * 0.12, -time * 0.08));
	h += 0.07 * fbm(p * 1.3 - vec2(time * 0.3, time * 0.21));
	h += 0.025 * fbm(p * 3.7 + vec2(time * 0.5, -time * 0.37));
	return h * q;
}

void fragment() {
	// no water inside the hull (user 2026-10-27: the boat looked flooded — its deck sits below the flat water plane):
	// the 5 m × 1.85 m footprint, the bow tapering over its front 1.9 m, inset so the hull's outside still meets the sea
	vec2 bd = wpos.xz - boat_pos;
	float bu = dot(bd, boat_dir), bv = dot(bd, vec2(-boat_dir.y, boat_dir.x));
	float half_beam = 0.80 * sqrt(clamp((2.45 - bu) / 1.9, 0.0, 1.0));
	if (bu > -2.35 && bu < 2.45 && abs(bv) < half_beam) { discard; }
	vec2 p = wpos.xz + drift;
	float e = 0.15;
	float h0 = sea(p);
	vec3 n = normalize(vec3((h0 - sea(p + vec2(e, 0.0))) * 2.5, e, (h0 - sea(p + vec2(0.0, e))) * 2.5));
	vec3 V = normalize(CAMERA_POSITION_WORLD - wpos);

	// what is below: refracted screen sample, and how far the light travels through the water to reach it
	vec2 ruv = SCREEN_UV + n.xz * 0.025;
	float dz = texture(depth_tex, ruv).r;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(ruv, dz) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(ruv * 2.0 - 1.0, dz);
#endif
	vec4 vp = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	vp.xyz /= vp.w;
	vec3 below_w = (INV_VIEW_MATRIX * vec4(vp.xyz, 1.0)).xyz;
	if (below_w.y > wpos.y) { ruv = SCREEN_UV; }   // refraction picked something above the water: don't
	float depth_below = max(0.0, wpos.y - below_w.y);
	float path = depth_below * (1.0 + 1.0 / max(V.y, 0.2)) * 0.5 + depth_below;   // down and back up, roughly
	vec3 seen = texture(screen_tex, ruv).rgb;   // no mip blur: the web build has no mipmaps on the screen copy
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
	col *= 0.8 + 0.4 * fbm(p * 0.02 + time * 0.005);

	// surface
	float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
	vec3 sky = sky_col * mix(1.0, 0.4, murk);
	col = mix(col, sky * 0.55, fres);
	// ripples catching the light (Water.js-style sun diffuse): faces toward the sun lighter, the backs darker
	vec3 Ld = -normalize(sun_dir);
	col *= 0.55 + 0.9 * clamp(dot(n, normalize(vec3(Ld.x, 0.35, Ld.z))) , 0.0, 1.0);
	col += sky * 0.5 * (1.0 - n.y);
	vec3 L = -normalize(sun_dir);
	vec3 H = normalize(L + V);
	float spec = pow(max(dot(n, H), 0.0), 700.0) * 40.0 + pow(max(dot(n, H), 0.0), 60.0) * 0.5;
	col += vec3(1.0, 0.95, 0.85) * spec * (1.0 - 0.6 * calm) * (1.0 - 0.55 * murk);

	// wake: thin broken foam along the arms of the V, a faint turquoise propwash down the middle
	// (the thick white core band was taken out, user 2026-10-27)
	vec2 d = wpos.xz - boat_pos;
	vec2 perp = vec2(-boat_dir.y, boat_dir.x);
	float s = -dot(d, boat_dir) - 2.8;             // metres behind the transom
	float x = dot(d, perp);
	if (s > -0.5) {
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
