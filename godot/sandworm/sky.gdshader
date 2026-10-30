// 沙蟲 sky: a dusty desert sunset — a hot orange horizon fading to a hazy dusk blue overhead, a low sun with a wide
// glow, and broken cloud lit orange from below on the sun's side (two octaves of value noise on a flat ceiling).
shader_type sky;

uniform vec3 top : source_color = vec3(0.42, 0.36, 0.38);
uniform vec3 hor : source_color = vec3(1.0, 0.58, 0.22);
uniform vec3 sun_col : source_color = vec3(1.0, 0.78, 0.45);
uniform vec3 sun_dir = vec3(0.8, 0.1, -0.6);   // toward the sun
uniform float light_k = 1.0;
uniform float dust = 0.0;                      // 0 … 1: the sky browns over with blown sand
uniform float time_s = 0.0;
uniform bool gray = false;

float h21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

void sky() {
	vec3 d = EYEDIR;
	vec3 s = normalize(sun_dir);
	float sd = max(dot(d, s), 0.0);
	vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.55, d.y), 0.7));
	// the warm side of the sky is the sun's side
	c = mix(c, hor * 1.05, 0.35 * pow(sd, 3.0) * (1.0 - smoothstep(0.0, 0.5, d.y)));
	if (d.y > 0.0) {
		vec2 p = d.xz / (d.y + 0.06) * 1.3 + vec2(time_s * 0.006, time_s * 0.004);
		float n = vn(p) * 0.55 + vn(p * 2.3 + 1.7) * 0.3 + vn(p * 5.1 - 3.1) * 0.15;
		float cl = smoothstep(0.42, 0.72, n) * smoothstep(0.02, 0.2, d.y);
		vec3 lit = mix(vec3(0.5, 0.34, 0.3), vec3(1.0, 0.66, 0.36), pow(sd, 1.5));
		c = mix(c, lit, cl * 0.85);
	}
	// sun disk and glow
	c += sun_col * (pow(sd, 1400.0) * 10.0 + pow(sd, 120.0) * 0.6 + pow(sd, 10.0) * 0.12);
	// blown sand: the whole sky toward a brown-orange haze, strongest low
	c = mix(c, vec3(0.78, 0.5, 0.28), dust * 0.6 * (1.0 - smoothstep(0.0, 0.6, d.y) * 0.5));
	if (d.y < 0.0) c = hor * 0.85;
	COLOR = gray ? vec3(0.85) : c * light_k;
}
