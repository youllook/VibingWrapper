// 沙蟲 ground: one big grid in world space. Dunes (warped ridges along the wind), flattened under the arch and where
// the worm comes up, rising to a ragged mountain line far out; the worm's mound and crater (`mound`, `rim`) and a
// quake that shivers the sand near it. The fragment adds wind ripples and colour drift. Keep height() in step with
// main.gd's ground_at() (the rocks are set on it).
shader_type spatial;
render_mode skip_vertex_transform;

uniform vec3 worm_pos = vec3(0.0);
uniform float worm_r = 14.0;
uniform float mound = 0.0;        // m: the sand heaved up over it before it breaks out
uniform float rim = 0.0;          // m: the crater rim once it is through
uniform float quake = 0.0;        // 0 … 1
uniform float time_s = 0.0;
uniform vec3 sand_a : source_color = vec3(0.86, 0.52, 0.27);
uniform vec3 sand_b : source_color = vec3(0.72, 0.40, 0.20);
uniform bool gray = false;

varying vec3 wp;

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
float fbm(vec2 p) {
	return vn(p) * 0.5 + vn(p * 2.03 + 1.7) * 0.25 + vn(p * 4.01 - 3.1) * 0.125 + vn(p * 8.07 + 5.3) * 0.0625;
}

float height(vec2 p) {
	// dunes: two sets of crests, warped so they meander; sharp crests (1 − |sin|)
	vec2 q = p + 260.0 * vec2(fbm(p * 0.0016), fbm(p * 0.0016 + 7.3)) ;
	float a = 1.0 - abs(sin(dot(q, vec2(0.94, 0.34)) * 0.0105));
	float b = 1.0 - abs(sin(dot(q, vec2(0.3, 0.95)) * 0.0062 + 1.3));
	float d = 15.0 * a * a + 22.0 * b * b * b + 8.0 * fbm(p * 0.01);
	float flat_k = smoothstep(55.0, 170.0, length(p)) * smoothstep(worm_r * 3.0, worm_r * 10.0, distance(p, worm_pos.xz));
	float h = d * flat_k;
	// a ragged range far out
	float far = smoothstep(1400.0, 2600.0, length(p));
	float ridge = 1.0 - abs(fbm(p * 0.0011) * 2.0 - 1.0);
	h += far * (35.0 + 150.0 * ridge * ridge);
	// the worm: a mound before it breaks out, then a crater rim; the quake shivers the sand round it
	float r = distance(p, worm_pos.xz);
	h += mound * exp(-r * r / (worm_r * worm_r * 9.0));
	h += rim * exp(-pow((r - worm_r * 1.6) / (worm_r * 0.8), 2.0)) - rim * 1.4 * exp(-r * r / (worm_r * worm_r));
	h += quake * 0.35 * sin(r * 0.9 - time_s * 18.0) * exp(-r / 120.0);
	return h;
}

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float e = 1.5;
	float h = height(w.xz);
	w.y = h;
	vec3 n = normalize(vec3(height(w.xz - vec2(e, 0.0)) - height(w.xz + vec2(e, 0.0)), 2.0 * e,
		height(w.xz - vec2(0.0, e)) - height(w.xz + vec2(0.0, e))));
	wp = w;
	VERTEX = (VIEW_MATRIX * vec4(w, 1.0)).xyz;
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
}

void fragment() {
	vec2 p = wp.xz;
	float dist = length(wp - (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
	// wind ripples: fine crests across the wind, bent by noise; fade out with distance (they would alias)
	float rip_k = 1.0 - smoothstep(20.0, 90.0, dist);
	vec2 rq = p + 3.0 * vec2(vn(p * 0.05), vn(p * 0.05 + 3.1));
	float ph = dot(rq, vec2(0.34, -0.94)) * 4.4;
	float rip = sin(ph + 0.6 * sin(ph));
	vec3 nw = vec3(cos(ph) * 0.34, 0.0, cos(ph) * 0.94) * 0.11 * rip_k;
	NORMAL = normalize(NORMAL + (VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	float tone = fbm(p * 0.004) * 0.6 + fbm(p * 0.05) * 0.4;
	vec3 col = mix(sand_b, sand_a, smoothstep(0.25, 0.75, tone));
	// the sides of the dunes facing away from the low sun go darker
	vec3 nwld = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	col *= mix(0.82, 1.0, smoothstep(-0.25, 0.2, dot(nwld.xz, normalize(vec2(0.56, -0.83)))));
	col = mix(col * vec3(0.78, 0.6, 0.5), col, smoothstep(30.0, 70.0, dist));         // near: deeper brown-orange
	col = mix(col, vec3(0.93, 0.6, 0.48), 0.35 * smoothstep(150.0, 700.0, dist));     // middle: toward pink-orange
	ALBEDO = gray ? vec3(0.5) : col;
	ROUGHNESS = 0.92;
	SPECULAR = 0.25;
}
