// 沙蟲 dust billows (plume, dust wall, drift, devils): camera-facing particle quads. Only the alpha of the particle
// colour is used (its fade over life); the colour itself is `tint`. With the stock material some billows at the
// worm's base came out with a near-black particle colour and stacked into a hard dark boulder.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D tex : source_color, filter_linear_mipmap;
uniform vec3 tint : source_color = vec3(1.0, 0.8, 0.56);
uniform float glow = 1.0;
uniform float alpha_k = 1.0;

void vertex() {
	// billboard, keeping the particle's scale
	mat4 bb = mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	bb = bb * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0),
		vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_MATRIX = VIEW_MATRIX * bb;
}

void fragment() {
	vec4 t = texture(tex, UV);
	ALBEDO = tint * t.rgb * glow;
	ALPHA = clamp(t.a * COLOR.a * alpha_k, 0.0, 1.0);
}
