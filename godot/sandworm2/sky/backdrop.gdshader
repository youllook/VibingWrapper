// 沙蟲 far backdrop: the far-only plate (sky, clouds, sun, ridges, haze) on a camera-filling quad.
// Clouds drift (upper sky only, masked off near the horizon and around the sun); the sun glow breathes.
// Sits behind everything: no depth write, and it hangs 15 km out (beyond the 8 km dunes), so the ordinary
// depth test puts all other geometry in front of it.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, fog_disabled, shadows_disabled;

uniform sampler2D plate : source_color, filter_linear_mipmap, repeat_disable;
// cloud drift
uniform vec2 drift_dir = vec2(1.0, -0.08);         // direction in UV (x right, y down)
uniform float drift_speed : hint_range(0.0, 0.02) = 0.0025; // UV per second
uniform float drift_span : hint_range(0.0, 0.1) = 0.03;    // max shift before the two phases cross-fade (UV)
uniform float churn : hint_range(0.0, 0.02) = 0.004;       // small noisy warp so the clouds roil a little
uniform float cloud_bottom : hint_range(0.0, 1.0) = 0.41;  // UV y where the flow fades out (horizon below stays still)
uniform float cloud_feather : hint_range(0.0, 0.3) = 0.10;
uniform float sun_keepout : hint_range(0.0, 0.5) = 0.10;   // radius (in frame-height units) kept still around the sun
// sun glow
uniform vec2 sun_uv = vec2(0.903, 0.473);          // 1510/1672, 445/941
uniform float aspect = 1.7768;
uniform vec3 glow_color : source_color = vec3(1.0, 0.72, 0.36);
uniform float glow_radius : hint_range(0.01, 1.0) = 0.22;  // frame-height units
uniform float glow_strength : hint_range(0.0, 1.0) = 0.12; // breathing amplitude (added light)
uniform float glow_speed : hint_range(0.0, 3.0) = 0.35;    // breaths per second ×2π

void vertex() {
	POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	// no depth pin: Godot 4 uses reversed Z, so w * 0.999999 lands on the NEAR plane and the plate covered the
	// whole scene; at `distance` (15 km, inside the camera's far plane) the ordinary depth test keeps it behind
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	vec2 uv = UV;
	vec2 a = vec2(aspect, 1.0);
	// where the clouds may move: upper sky, not near the sun disc
	float m = 1.0 - smoothstep(cloud_bottom - cloud_feather, cloud_bottom, uv.y);
	m *= smoothstep(sun_keepout * 0.6, sun_keepout * 1.6, length((uv - sun_uv) * a));

	// two-phase flow (classic flow-map trick): each phase slides the plate up to drift_span, then
	// fades out while the other, half a cycle behind, fades in; a noise phase offset hides the pulse
	float period = drift_span / max(drift_speed, 1e-5);
	float ph = vnoise(uv * vec2(3.0, 6.0)) * 0.35;
	float t0 = fract(TIME / period + ph);
	float t1 = fract(TIME / period + ph + 0.5);
	vec2 d = normalize(drift_dir) * drift_span;
	vec2 w = vec2(vnoise(uv * 9.0 + TIME * 0.05), vnoise(uv * 9.0 + 17.0 - TIME * 0.04)) - 0.5;
	vec2 warp = w * churn;
	vec3 c0 = texture(plate, clamp(uv - d * (t0 - 0.5) * m + warp * m, 0.001, 0.999)).rgb;
	vec3 c1 = texture(plate, clamp(uv - d * (t1 - 0.5) * m + warp * m, 0.001, 0.999)).rgb;
	float k = abs(t0 * 2.0 - 1.0); // 1 at the ends of phase 0, where phase 1 is mid-way
	vec3 col = mix(c0, c1, k);

	// sun glow breathing (additive, soft, never below the plate)
	float r = length((uv - sun_uv) * a) / glow_radius;
	float g = exp(-r * r * 2.5);
	float breath = 0.5 + 0.5 * sin(TIME * glow_speed * 6.2831853);
	col += glow_color * g * glow_strength * breath;

	ALBEDO = col;
}
