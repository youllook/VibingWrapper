// 沙粒／沙塊粒子：小而實的 billboard，被噴出後拋物線落回（物理在 CPUParticles3D）。
// 顏色只吃 tint/shade uniform（不讀粒子 RGB），alpha 由壽命（INSTANCE_CUSTOM.y）算。
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;

uniform sampler2D grain : filter_linear_mipmap, repeat_enable;
uniform vec3 tint : source_color = vec3(0.85, 0.57, 0.32);
uniform vec3 shade : source_color = vec3(0.74, 0.45, 0.25);
uniform float opacity = 0.9;
uniform float size = 1.0;
uniform float min_px = 3.0;   // never smaller than this many pixels (stays visible at 250 m)

varying float life;
varying float rnd;

void vertex() {
	life = INSTANCE_CUSTOM.y;
	rnd = fract(float(INSTANCE_ID) * 0.6180339);
	vec4 c = VIEW_MATRIX * vec4(MODEL_MATRIX[3].xyz, 1.0);
	float s = length(MODEL_MATRIX[0].xyz) * size;
	// keep a minimum on-screen size: metres per pixel at this depth
	float mpp = -c.z * 2.0 / (PROJECTION_MATRIX[1][1] * VIEWPORT_SIZE.y);
	s = max(s, mpp * min_px);
	float a = INSTANCE_CUSTOM.x;
	vec2 v = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a))) * VERTEX.xy;
	// clumps are a little squashed / stretched, not perfect discs
	v.y *= 0.7 + 0.6 * rnd;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	VERTEX = vec3(v * s, 0.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float n = texture(grain, UV * 0.35 + vec2(rnd, rnd * 3.7)).r;
	float d = 1.0 - smoothstep(0.55, 0.85, length(p) + (n - 0.5) * 0.6);
	vec3 col = mix(shade * 0.8, shade, 0.3 + 0.5 * rnd + 0.2 * (0.5 - p.y * 0.5));
	ALBEDO = col;
	float fade = smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.85, 1.0, life));
	ALPHA = clamp(d * opacity * fade, 0.0, 1.0);
}
