// 大海怪3 boat: Tripo's soaked planks up close (user 2026-10-30: the near boat needs more detail). Tripo's 2K atlas is a
// patchwork that the gunwale, a metre from the lens, stretches to mush; this keeps its colour, roughness and normals for
// the large-scale variation and lays procedural wood over them in the boat's own frame: planks along the hull (+Z) with
// dark seams and butt joints, long wavering grain, a knot now and then, worn blotches; the grain is bumped into the
// normal so the wet sheen catches it.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic;
uniform sampler2D rm_tex : hint_default_white, filter_linear_mipmap_anisotropic;   // glTF: G roughness
uniform float metres = 1.0;              // model units → metres (the boat's scale)
uniform vec3 tint = vec3(0.5, 0.48, 0.46);
uniform float plank_w = 0.16;           // plank width, metres
uniform float grain = 1.0;              // how much of the procedural wood shows
uniform float bump = 1.6;               // how deep the grain and seams read

varying vec3 lp;                         // boat-local position, metres
varying vec3 ln;                         // boat-local normal

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 1.7) + 0.125 * vnoise(p * 4.1 + 3.1); }

// wood on a slice: x along the planks (the hull's length), y across them, metres. Returns lightness, seam, height
vec3 wood(vec2 uv, float px) {   // px: metres per pixel here (fades what is too fine to draw)
	float row = floor(uv.y / plank_w);
	float across = fract(uv.y / plank_w);
	float len = 2.2 + 1.4 * h21(vec2(row, 9.0));                   // butt joints every 2.2–3.6 m
	float along = uv.x + h21(vec2(row, 3.0)) * 7.0;
	float piece = floor(along / len), jf = fract(along / len);
	float warp = fbm(vec2(along * 0.5, row * 4.0 + across * 1.5)) * 2.0;
	float rings = sin((across * 7.0 + warp * 2.5 + h21(vec2(row, piece)) * 6.0) * 3.1416);
	// fibres about 4 mm and 1.5 mm apart, each fading out once it is under ~2 pixels (no shimmer)
	float f1 = 1.0 - smoothstep(0.5, 1.0, px * 40.0 / plank_w), f2 = 1.0 - smoothstep(0.5, 1.0, px * 110.0 / plank_w);
	float fib = 0.5 + f1 * 0.7 * (vnoise(vec2(along * 1.5, across * 40.0 + row * 31.0)) - 0.5) + f2 * 0.5 * (vnoise(vec2(along * 4.0, across * 110.0)) - 0.5);
	float light = 0.62 + 0.24 * rings + 0.55 * (fib - 0.5) + 0.35 * (h21(vec2(row, piece + 5.0)) - 0.5);
	float kx = floor(along / 0.9);
	vec2 kd = (vec2(along, across) - vec2(kx * 0.9 + 0.45, 0.5)) * vec2(1.0, plank_w / 0.04);
	float knot = h21(vec2(row * 7.0, kx)) > 0.84 ? 1.0 - smoothstep(0.015, 0.07, length(kd)) : 0.0;
	light *= (1.0 - 0.6 * knot) * (0.75 + 0.35 * fbm(vec2(along * 1.2, uv.y * 2.5) + 11.0));
	float seam = 1.0 - smoothstep(0.0, 0.04, min(across, 1.0 - across));
	seam = max(seam, 1.0 - smoothstep(0.0, 0.003, min(jf, 1.0 - jf) * len));
	float h = 0.6 * fib + 0.2 * rings - 1.5 * seam - 0.5 * knot;
	return vec3(clamp(light, 0.0, 1.4), seam, h);
}

void vertex() {
	lp = VERTEX * metres;
	ln = NORMAL;
}

void fragment() {
	vec3 n = normalize(ln);
	vec3 an = abs(n);
	// the planks run along the hull (+Z), across them up the sides (Y) or across the deck and the rail's top (X); a
	// face looking along the hull (a post's front, the transom) has its grain running up (Y), across it X
	vec3 alongAx = vec3(0.0, 0.0, 1.0), acrossAx = vec3(0.0, 1.0, 0.0);
	if (an.z > max(an.x, an.y)) { alongAx = vec3(0.0, 1.0, 0.0); acrossAx = vec3(1.0, 0.0, 0.0); }
	else if (an.y > an.x) acrossAx = vec3(1.0, 0.0, 0.0);
	vec2 uv = vec2(dot(lp, alongAx), dot(lp, acrossAx));
	float px = length(fwidth(lp));
	vec3 w = wood(uv, px);
	// the height's slope by finite differences (2 mm), along and across → tilt the local normal
	const float EPS = 0.002;
	float gx = (wood(uv + vec2(EPS, 0.0), px).z - w.z) / EPS;
	float gy = (wood(uv + vec2(0.0, EPS), px).z - w.z) / EPS;
	vec3 nl = normalize(n - grain * bump * 0.004 * (gx * alongAx + gy * acrossAx));
	NORMAL = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(nl, 0.0)).xyz);

	vec3 base = texture(albedo_tex, UV).rgb * tint;
	vec3 woodCol = vec3(0.38, 0.29, 0.20) * w.x;
	ALBEDO = mix(base, base * 0.4 + woodCol, grain) * (1.0 - 0.65 * w.y * grain);
	ROUGHNESS = clamp(mix(texture(rm_tex, UV).g, 0.3, 0.7) + 0.35 * w.y + 0.2 * (0.6 - w.x), 0.12, 0.95);   // soaked: glossy; seams dull
	METALLIC = 0.0;
	NORMAL_MAP = texture(normal_tex, UV).rgb;
	NORMAL_MAP_DEPTH = 1.5;
}
