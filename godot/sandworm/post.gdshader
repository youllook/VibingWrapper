// 沙蟲 lens: a warm film grade over the finished frame — orange highlights, brown shadows, a little bloom off the
// sun side, blown-sand haze (`dust`), a shaking camera (`shake`, done in main.gd) leaves only the grain here;
// vignette and grain.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float dust = 0.0;                    // 0 … 1: blown sand over the whole frame
uniform float grain = 0.03;
uniform float time_s = 0.0;
uniform float sat = 0.95;
uniform vec3 shadow_tint = vec3(0.92, 0.86, 0.82);
uniform vec3 high_tint = vec3(1.06, 0.98, 0.88);
uniform vec2 sun_uv = vec2(0.85, 0.45);
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

void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 col = texture(screen_tex, uv).rgb;
	// cheap bloom: a wide blur of the bright parts from a low mip
	vec3 bl = textureLod(screen_tex, uv, 5.0).rgb;
	col += max(bl - 0.9, 0.0) * 0.8;
	// blown sand: streaky drifting haze, thicker low in the frame
	float n = vn(vec2(uv.x * 6.0 - time_s * 0.9, uv.y * 22.0)) * 0.6 + vn(vec2(uv.x * 2.0 - time_s * 0.3, uv.y * 5.0)) * 0.4;
	float haze = dust * (0.35 + 0.65 * n) * (0.55 + 0.45 * uv.y);
	col = mix(col, vec3(0.86, 0.58, 0.34) * (0.8 + 0.4 * n), clamp(haze * 0.3, 0.0, 0.5));
	// grade
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(lum), col, sat);
	col *= mix(shadow_tint, high_tint, smoothstep(0.05, 0.7, lum));
	col = (col - 0.5) * 1.05 + 0.5;
	// a warm glow toward the sun
	float a = SCREEN_PIXEL_SIZE.x / SCREEN_PIXEL_SIZE.y;
	vec2 sv = (uv - sun_uv) * vec2(1.0 / a, 1.0);
	col += vec3(1.0, 0.6, 0.3) * 0.06 * exp(-dot(sv, sv) * 10.0);
	vec2 v = uv - 0.5;
	col *= 1.0 - 0.6 * pow(length(v * vec2(1.0, 1.25)), 2.3);
	col += (h21(FRAGCOORD.xy + fract(time_s * 13.7) * 311.0) - 0.5) * grain;
	COLOR = gray ? vec4(texture(screen_tex, uv).rgb, 1.0) : vec4(max(col, 0.0), 1.0);
}
