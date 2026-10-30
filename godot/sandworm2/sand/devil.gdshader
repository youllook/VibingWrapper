// 塵捲風柱：上寬下窄的開口圓筒，條紋繞著轉、往上升；側緣（掠射角）透明、中間最濃。unshaded、只用 tint。
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, fog_disabled;

uniform sampler2D streak : filter_linear_mipmap, repeat_enable;
uniform sampler2D grain : filter_linear_mipmap, repeat_enable;
uniform vec3 tint : source_color = vec3(0.88, 0.64, 0.4);
uniform vec3 glow : source_color = vec3(1.0, 0.86, 0.62);
uniform vec3 sun_dir = vec3(0.48, 0.06, -0.87);
uniform float opacity = 0.55;
uniform float spin = 0.35;     // turns per second
uniform float rise = 0.25;     // texture lengths per second
uniform float sway = 2.5;      // metres the column bends at the top
uniform float seed = 0.0;
uniform float height = 50.0;

varying vec3 wn;
varying vec3 wp;
varying float fwd;

void vertex() {
	float t = UV.y;   // 0 bottom … 1 top (devil.gd builds it that way)
	float s = TIME * 0.4 + seed * 6.28;
	VERTEX.x += (sin(s + t * 2.2) * 0.7 + sin(s * 1.7 + t * 4.0) * 0.3) * sway * t * t;
	VERTEX.z += (cos(s * 0.8 + t * 1.9) * 0.7) * sway * t * t;
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 o = MODEL_MATRIX[3].xyz + vec3(0.0, height * 0.5, 0.0);
	fwd = max(dot(normalize(o - INV_VIEW_MATRIX[3].xyz), normalize(sun_dir)), 0.0);
}

void fragment() {
	float t = UV.y;
	vec3 v = normalize(CAMERA_POSITION_WORLD - wp);
	vec3 n = normalize(wn);
	float facing = abs(dot(n, v));
	vec2 uv = vec2(UV.x * 2.0 + TIME * spin - t * 1.6 + seed, t * 1.4 - TIME * rise);
	float s = 0.2 + texture(streak, uv).r * 0.7 + texture(grain, vec2(UV.x * 2.0 + TIME * spin * 0.7, t * 0.6 - TIME * rise * 0.5 + seed)).g * 0.7 - 0.15;
	// clumps drifting up the column: whole bands thin out and thicken
	s *= 0.45 + 0.9 * texture(grain, vec2(seed * 0.37, t * 0.35 - TIME * rise * 0.6)).b;
	float body = smoothstep(0.05, 0.6, facing);
	float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.3, 1.0, t));
	float a = clamp(s * body * fade * opacity * (1.15 - 0.5 * t), 0.0, 1.0);
	vec3 col = mix(tint, glow, clamp((1.0 - body) * 0.6 + 0.4 * pow(fwd, 4.0), 0.0, 1.0));
	ALBEDO = col;
	ALPHA = a;
}
