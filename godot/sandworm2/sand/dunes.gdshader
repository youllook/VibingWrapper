// 沙丘地面：高度場（dune_hn.png，每 2048 m 重複）＋破土火山口＋清空區，沙紋在 fragment 用法線做、遠處自動淡掉。
// The node must sit at the world origin unrotated (heights are computed from world xz). dunes.gd feeds every uniform.
shader_type spatial;
render_mode cull_back;

uniform sampler2D hn : filter_linear_mipmap, repeat_enable;   // R height 0..1, G/B gradient
uniform sampler2D grain : filter_linear_mipmap, repeat_enable;
uniform float tile = 2048.0;
uniform float dune_h = 12.0;     // metres for R = 1
uniform float dune_base = 0.4;   // R value that sits at y = 0
uniform float dune_amp = 1.0;
uniform vec2 crater_c = vec2(0.0, -600.0);
uniform float crater_r = 90.0;
uniform float mound = 14.0;
uniform vec2 clear_c = vec2(0.0);
uniform float clear_r = 40.0;
uniform vec2 wind = vec2(0.8, 0.6);   // ripple crests run across this
uniform float ripple = 0.45;
uniform vec3 sand : source_color = vec3(0.85, 0.6, 0.36);
uniform vec3 sand_trough : source_color = vec3(0.74, 0.47, 0.27);
uniform vec3 sand_crest : source_color = vec3(0.95, 0.72, 0.47);
uniform vec3 haze : source_color = vec3(0.98, 0.66, 0.38);
uniform float haze_near = 300.0;
uniform float haze_far = 3800.0;
uniform float haze_max = 0.85;

varying vec3 wpos;

float dune_mask(vec2 p) {
	float r = length(p - crater_c);
	float c = smoothstep(0.7 * crater_r, 1.8 * crater_r, r);
	float k = smoothstep(clear_r, 2.0 * clear_r, length(p - clear_c));
	return c * k;
}

// rim at crater_r, bowl inside, apron outside
float crater(vec2 p) {
	float r = length(p - crater_c) / max(crater_r, 1.0);
	float inner = -0.35 + 1.35 * r * r;
	float outer = exp(-pow((r - 1.0) / 0.75, 2.0));
	return mound * (r < 1.0 ? inner : outer);
}

float height(vec2 p) {
	float d = textureLod(hn, p / tile, 0.0).r;
	return (d - dune_base) * dune_h * dune_amp * dune_mask(p) + crater(p);
}

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	VERTEX.y = height(w.xz);
	wpos = vec3(w.x, VERTEX.y, w.z);
}

void fragment() {
	vec2 p = wpos.xz;
	vec4 t = texture(hn, p / tile);
	float m = dune_mask(p);
	vec2 g = (t.gb - 0.5) * 0.8 * dune_amp * m;
	float e = 0.75;
	g += vec2(crater(p + vec2(e, 0.0)) - crater(p - vec2(e, 0.0)), crater(p + vec2(0.0, e)) - crater(p - vec2(0.0, e))) / (2.0 * e);
	vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

	// wind ripples: two scales, crests warped by grain noise; fade out once they shrink below a few pixels
	vec2 wd = normalize(wind);
	float warp = texture(grain, p / 61.0).g * 2.4 + texture(grain, p / 17.0).g * 0.9;
	float slope = length(g);
	float rk = ripple * (1.0 - smoothstep(0.12, 0.3, slope));
	vec2 dn = vec2(0.0);
	for (int i = 0; i < 2; i++) {
		float lam = i == 0 ? 1.1 : 0.42;
		float s = dot(p, wd) / lam + warp * (i == 0 ? 1.0 : 1.7);
		float fw = fwidth(s);
		float fade = 1.0 - smoothstep(0.12, 0.45, fw);
		float ph = fract(s);
		// asymmetric ripple slope: long stoss, short lee
		float d = ph < 0.7 ? 1.0 / 0.7 : -1.0 / 0.3;
		d *= sin(ph * 3.14159);
		dn += wd * d * fade * (i == 0 ? 0.6 : 0.35);
	}
	n = normalize(n - vec3(dn.x, 0.0, dn.y) * rk);
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);

	float h = t.r;
	vec3 col = mix(sand_trough, sand, smoothstep(0.1, 0.5, h));
	col = mix(col, sand_crest, smoothstep(0.6, 0.95, h) * m);
	float gr = texture(grain, p / 23.0).r * 0.7 + texture(grain, p / 1.3).r * 0.3;
	col *= 0.95 + 0.1 * gr;
	// disturbed sand around the crater is a touch darker and redder
	float cr = length(p - crater_c) / max(crater_r, 1.0);
	col = mix(col, sand_trough * 0.92, (1.0 - smoothstep(0.8, 1.6, cr)) * 0.5 * step(0.01, mound));

	float dist = length(wpos - CAMERA_POSITION_WORLD);
	float hz = smoothstep(haze_near, haze_far, dist) * haze_max;
	ALBEDO = col * (1.0 - hz);
	EMISSION = haze * hz;
	ROUGHNESS = 0.92;
	SPECULAR = 0.25;
}
