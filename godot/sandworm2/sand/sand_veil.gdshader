// 沙幕（粒子版）：塵團底下往下掉的沙，直立長條、只繞 Y 轉向鏡頭，條紋往下流。CPUParticles3D 用。
// 顏色只吃 tint/glow uniform，alpha 由壽命（INSTANCE_CUSTOM.y）算。
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;

uniform sampler2D streak : filter_linear_mipmap, repeat_enable;
uniform vec3 tint : source_color = vec3(0.85, 0.57, 0.32);
uniform vec3 glow : source_color = vec3(1.0, 0.74, 0.42);
uniform float opacity = 0.5;
uniform float size = 1.0;
uniform float aspect = 3.0;     // height / width
uniform float speed = 0.6;
uniform float ground_y = 0.0;
uniform float ground_soft = 8.0;

varying float life;
varying float rnd;
varying float wy;

void vertex() {
	life = INSTANCE_CUSTOM.y;
	rnd = fract(float(INSTANCE_ID) * 0.7548776);
	vec3 o = MODEL_MATRIX[3].xyz;
	float w = length(MODEL_MATRIX[0].xyz) * size;
	vec3 to_c = INV_VIEW_MATRIX[3].xyz - o;
	to_c.y = 0.0;
	vec3 right = normalize(vec3(to_c.z, 0.0, -to_c.x) + vec3(1e-4, 0.0, 0.0));
	float t = VERTEX.y + 0.5;
	// hangs below its particle: top at the particle, widening as it falls
	vec3 p = o + right * VERTEX.x * w * (0.7 + 0.6 * (1.0 - t)) - vec3(0.0, (1.0 - t) * w * aspect, 0.0);
	wy = p.y;
	VERTEX = (inverse(MODEL_MATRIX) * vec4(p, 1.0)).xyz;
}

void fragment() {
	float t = 1.0 - UV.y;
	vec2 uv = vec2(UV.x * 0.5 + rnd, UV.y * 1.2 - TIME * speed + rnd * 5.0);
	float s = texture(streak, uv).r;
	float s2 = texture(streak, uv * vec2(2.3, 0.7) + vec2(0.31, -TIME * speed * 0.5)).r;
	float a = clamp(0.15 + s * 0.8 + s2 * 0.5, 0.0, 1.0);
	float edge = smoothstep(0.0, 0.35, UV.x) * smoothstep(1.0, 0.65, UV.x);
	float fade = smoothstep(1.0, 0.8, t) * smoothstep(0.0, 0.5, t);
	float lf = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.6, 1.0, life));
	float gs = smoothstep(ground_y, ground_y + ground_soft, wy);
	ALBEDO = mix(tint, glow, 0.25 + 0.3 * (1.0 - a));
	ALPHA = clamp(a * edge * fade * lf * gs * opacity, 0.0, 1.0);
}
