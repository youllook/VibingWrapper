// 沙瀑：MultiMesh 的直立條帶（只繞 Y 轉向鏡頭），條紋往下流。一條 = 一個 instance，
// INSTANCE_CUSTOM = (相位, 速度倍率, 寬度倍率, 透明度倍率)。unshaded、只用 tint，不讀頂點色。
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;

uniform sampler2D streak : filter_linear_mipmap, repeat_enable;
uniform vec3 tint : source_color = vec3(0.86, 0.6, 0.35);
uniform vec3 glow : source_color = vec3(1.0, 0.84, 0.58);
uniform vec3 sun_dir = vec3(0.48, 0.06, -0.87);
uniform float opacity = 0.7;
uniform float speed = 0.45;      // texture lengths per second (× the strip's own speed)
uniform float flare = 1.2;       // the sheet widens this much toward the bottom (spray opening up)
uniform float top_fade = 0.2;   // fraction of length
uniform float bottom_fade = 0.6;
uniform float wobble = 1.5;      // metres of sideways sway

varying float ph;
varying float spd;
varying float op;
varying float fwd;

void vertex() {
	ph = INSTANCE_CUSTOM.x;
	spd = INSTANCE_CUSTOM.y;
	op = INSTANCE_CUSTOM.w;
	// quad: x −0.5…0.5 across, y 0 (bottom) … 1 (top) once scaled by the instance basis
	vec3 o = MODEL_MATRIX[3].xyz;
	float w = length(MODEL_MATRIX[0].xyz) * INSTANCE_CUSTOM.z;
	float h = length(MODEL_MATRIX[1].xyz);
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	vec3 to_c = cam - o;
	to_c.y = 0.0;
	vec3 right = normalize(vec3(to_c.z, 0.0, -to_c.x) + vec3(1e-4, 0.0, 0.0));
	float t = VERTEX.y + 0.5;      // QuadMesh y is −0.5…0.5
	float wid = w * (1.0 + flare * (1.0 - t));
	vec3 p = o + right * VERTEX.x * wid + vec3(0.0, t * h, 0.0);
	p += right * sin(TIME * 0.7 + ph * 6.28 + t * 3.0) * wobble * (1.0 - t);
	VERTEX = (inverse(MODEL_MATRIX) * vec4(p, 1.0)).xyz;
	fwd = max(dot(normalize(o - cam), normalize(sun_dir)), 0.0);
}

void fragment() {
	float t = 1.0 - UV.y;   // 1 at top
	vec2 uv = vec2(UV.x * 0.6 + ph, UV.y * 1.6 - TIME * speed * spd + ph * 3.0);
	float s = texture(streak, uv).r;
	float s2 = texture(streak, uv * vec2(1.7, 0.6) + vec2(0.37, -TIME * speed * spd * 0.4)).r;
	float a = clamp(0.25 + s * 0.55 + s2 * 0.35, 0.0, 1.0);
	float edge = smoothstep(0.0, 0.45, UV.x) * smoothstep(1.0, 0.55, UV.x);
	float fade = smoothstep(1.0, 1.0 - top_fade, t) * smoothstep(0.0, bottom_fade, t);
	vec3 col = mix(tint, glow, clamp((1.0 - a) * (0.3 + 0.7 * pow(fwd, 3.0)) + 0.2 * pow(fwd, 6.0), 0.0, 1.0));
	ALBEDO = col;
	ALPHA = clamp(a * edge * fade * opacity * op, 0.0, 1.0);
}
