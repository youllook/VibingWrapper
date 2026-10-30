// 大海怪3 sky: a low storm ceiling — dark heavy cloud overhead, a paler band of rain haze at the horizon, cloud
// masses drifting slowly (two octaves of value noise on a flat ceiling).
shader_type sky;

uniform vec3 top : source_color = vec3(0.20, 0.23, 0.26);
uniform vec3 hor : source_color = vec3(0.50, 0.54, 0.56);
uniform float light_k = 1.0;
uniform float time_s = 0.0;

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
	vec3 c = mix(hor, top, smoothstep(0.0, 0.45, d.y));
	if (d.y > 0.0) {
		vec2 p = d.xz / (d.y + 0.08) * 1.6 + vec2(time_s * 0.012, time_s * 0.02);
		float n = vn(p) * 0.55 + vn(p * 2.3 + 1.7) * 0.3 + vn(p * 5.1 - 3.1) * 0.15;
		float k = smoothstep(0.02, 0.35, d.y);
		c *= mix(1.0, 0.65 + 0.6 * n, k);
	} else {
		c = hor * 0.9;
	}
	COLOR = c * light_k;
}
