// 沙蟲 rock close-up detail (stage 4): the Tripo colour/normal maps are 4K over a 95 m arch, so up close they read
// as clay. On top of them, in world space (triplanar, no UV stretch): level sandstone strata, dark cracks and
// cavities, fine grit, and a detail normal from the same noise. `rim` lifts the edges that face the bright
// opening (the target's glowing inner rim of the arch).
shader_type spatial;
render_mode cull_back;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap;
uniform bool has_normal = false;
uniform vec4 tint : source_color = vec4(1.0);
uniform float strata_scale = 0.32;    // strata per metre (vertical)
uniform float strata_k = 0.3;         // how dark the seams between strata get
uniform float crack_k = 0.4;          // crack / cavity darkening
uniform float grit_k = 0.18;
uniform float bump = 0.9;             // detail normal strength
uniform vec3 rim_pos = vec3(0.0, 22.0, -52.0);   // centre of the opening (world)
uniform vec3 rim_color : source_color = vec3(1.0, 0.55, 0.25);
uniform float rim = 1.6;
uniform float desat = 0.25;           // pull the Tripo colour toward grey-brown (it was made under flat daylight)
uniform float roughness_v = 0.92;

varying vec3 wp;
varying vec3 wn;

float h31(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}
float vn3(vec3 p) {
	vec3 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
	float a = 0.5, s = 0.0;
	for (int i = 0; i < 4; i++) { s += a * vn3(p); p = p * 2.03 + 17.1; a *= 0.5; }
	return s;
}
// the detail height field: level strata (warped), cracks, grit
float detail(vec3 p) {
	float warp = fbm(p * vec3(0.08, 0.3, 0.08)) * 3.0;
	float band = fract(p.y * strata_scale + warp);
	float seam = smoothstep(0.0, 0.12, band) * smoothstep(1.0, 0.85, band);   // 0 in the seam between layers
	float cav = smoothstep(0.32, 0.55, fbm(p * 0.45));                          // 0 in pockets
	float crack = smoothstep(0.02, 0.09, abs(fbm(p * vec3(1.1, 0.45, 1.1)) - 0.5));
	float grit = vn3(p * 9.0);
	return seam * 0.45 + cav * 0.35 + crack * 0.2 + grit * 0.08;
}

void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb;
	base = mix(base, vec3(dot(base, vec3(0.3, 0.55, 0.15))), desat) * tint.rgb;
	float warp = fbm(wp * vec3(0.08, 0.3, 0.08)) * 3.0;
	float band = fract(wp.y * strata_scale + warp);
	float w = mix(0.03, 0.16, fbm(wp * vec3(0.12, 0.6, 0.12)));
	float seam = smoothstep(0.0, w, band) * smoothstep(1.0, 1.0 - w * 0.6, band);
	seam = mix(1.0, seam, smoothstep(0.35, 0.6, fbm(wp * vec3(0.05, 0.4, 0.05) + 3.0)));   // seams fade in and out
	float cav = smoothstep(0.32, 0.55, fbm(wp * 0.45));
	float crack = smoothstep(0.02, 0.09, abs(fbm(wp * vec3(1.1, 0.45, 1.1)) - 0.5));
	float grit = vn3(wp * 9.0);
	float dark = mix(1.0 - strata_k, 1.0, seam) * mix(1.0 - crack_k, 1.0, crack * mix(0.6, 1.0, cav));
	dark *= 1.0 + (grit - 0.5) * grit_k;
	ALBEDO = base * dark;
	ROUGHNESS = roughness_v;
	// detail normal from the height field's world gradient
	float e = 0.06;
	float h0 = detail(wp);
	vec3 g = vec3(detail(wp + vec3(e, 0, 0)) - h0, detail(wp + vec3(0, e, 0)) - h0, detail(wp + vec3(0, 0, e)) - h0) / e;
	vec3 n = normalize(wn - (g - wn * dot(g, wn)) * bump * 0.15);
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	if (has_normal) {   // the model's own normal map, on top of the detail normal
		NORMAL_MAP = texture(normal_tex, UV).xyz;
		NORMAL_MAP_DEPTH = 0.6;
	}
	// glowing inner rim: surfaces turned toward the opening, seen edge-on, catch the light from outside
	vec3 to_open = normalize(rim_pos - wp);
	float facing = max(dot(n, to_open), 0.0);
	float edge = pow(1.0 - abs(dot(NORMAL, VIEW)), 3.0);   // only where the surface turns away from us
	EMISSION = rim_color * rim * facing * edge * base * dark * 2.5;
}
