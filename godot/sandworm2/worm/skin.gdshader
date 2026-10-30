// 沙蟲 skin (stage 4): the Tripo colour map, pulled toward the target's pale cream (it came out red-brown), with a
// warm backlit rim — the low sun is behind the worm, so its silhouette glows like the target's lip edges.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap;
uniform bool has_normal = false;
uniform vec3 cream : source_color = vec3(0.95, 0.8, 0.62);   // the target's skin
uniform float desat = 0.4;           // how far toward grey before tinting
uniform float to_cream = 0.6;        // then how far toward cream
uniform vec3 sun_to = vec3(0.555, 0.08, -0.83);
uniform vec3 rim_color : source_color = vec3(1.0, 0.66, 0.34);
uniform float rim = 1.2;
uniform float roughness_v = 0.8;
uniform float self_lit = 0.22;       // mood over optics: the worm faces away from the sun yet reads pale and lit in the target

void fragment() {
	vec3 c = texture(albedo_tex, UV).rgb;
	float l = dot(c, vec3(0.3, 0.55, 0.15));
	c = mix(c, vec3(l), desat);
	c = mix(c, cream * (0.45 + l), to_cream);
	ALBEDO = c;
	ROUGHNESS = roughness_v;
	if (has_normal) {
		NORMAL_MAP = texture(normal_tex, UV).xyz;
	}
	// backlight: silhouette edges, strongest where we look toward the sun
	vec3 sun_v = normalize((VIEW_MATRIX * vec4(sun_to, 0.0)).xyz);
	float edge = pow(1.0 - abs(dot(NORMAL, VIEW)), 3.0);
	float toward = clamp(dot(-VIEW, sun_v) * 0.5 + 0.5, 0.0, 1.0);
	EMISSION = rim_color * rim * edge * (0.3 + 0.7 * toward) * c + c * rim_color * self_lit;
}
