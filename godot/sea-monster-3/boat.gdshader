// 大海怪3 boat: Tripo's hull (300k faces, 2026-10-30: the 20k one had every edge rounded off) dressed in photographed
// wood instead of Tripo's own texture, which is a patchwork atlas whose grain runs every which way. Two CC0 Poly Haven
// sets (textures/wood/) are projected in the boat's own frame, so the grain follows the hull:
//   planks  worn_planks, red paint worn through — the sides, planks running along the hull (+Z)
//   timber  rough_wood — the rail's top and decks (grain along the hull) and faces looking along it (posts: grain up)
// Tripo's colour is kept only blurred (a high mip): the grime, rust and dark patches over the whole boat. Where Tripo
// fittings (cleats, pins, hooks: anything standing above the rail) they keep Tripo's own colour as rusted iron; Tripo's
// metal channel is empty, so they are found by height. Wet: dark and glossy.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;   // Tripo's: blurred for the grime; sharp on the fittings
// the top of the rail along the hull (sheer), y = a z² + b z + c in metres, per side (x > 0, x < 0), fitted to the model's
// vertices: whatever stands above it (cleats, pins, hooks, the bands on the posts) is a fitting, not plank
uniform vec3 sheer_pos = vec3(0.0125, -0.0271, 1.4005);
uniform vec3 sheer_neg = vec3(0.0279, -0.021, 1.2686);
uniform sampler2D planks_col : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D planks_nrm : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D planks_rgh : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D timber_col : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D timber_nrm : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D timber_rgh : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float metres = 1.0;              // model units → metres (the boat's scale)
uniform float planks_tile = 1.4;         // metres per texture repeat
uniform float timber_tile = 1.0;
uniform vec3 tint = vec3(0.48, 0.36, 0.32);   // soaked: darker, redder (the reference's wet red-brown)
uniform float grime = 0.8;               // how much of Tripo's blurred colour darkens it

varying vec3 lp;                         // boat-local position, metres
varying vec3 ln;                         // boat-local normal

void vertex() {
	lp = VERTEX * metres;
	ln = NORMAL;
}

// one projected sample: colour, roughness, and the normal map turned into the local frame (u, v: the local axes the
// texture's x and y run along)
void tap(sampler2D c, sampler2D n, sampler2D r, vec2 uv, vec3 u, vec3 v, vec3 nn, float w,
		inout vec3 col, inout float rgh, inout vec3 nrm) {
	col += texture(c, uv).rgb * w;
	rgh += texture(r, uv).r * w;
	vec3 t = texture(n, uv).rgb * 2.0 - 1.0;
	nrm += normalize(nn * t.z + u * t.x + v * t.y) * w;
}

void fragment() {
	vec3 n = normalize(ln);
	vec3 a = abs(n);
	vec3 w = pow(a, vec3(6.0));
	w /= (w.x + w.y + w.z);
	vec3 col = vec3(0.0), nrm = vec3(0.0);
	float rgh = 0.0;
	vec3 X = vec3(1, 0, 0), Y = vec3(0, 1, 0), Z = vec3(0, 0, 1);
	// sides (facing ±X): planks along Z — the texture's planks run along its y, so y ← z, x ← height
	if (w.x > 0.01) tap(planks_col, planks_nrm, planks_rgh, vec2(lp.y, lp.z) / planks_tile, Y, Z, n, w.x, col, rgh, nrm);
	// tops (facing ±Y): timber, grain (texture y) along the hull
	if (w.y > 0.01) tap(timber_col, timber_nrm, timber_rgh, vec2(lp.x, lp.z) / timber_tile, X, Z, n, w.y, col, rgh, nrm);
	// faces looking along the hull (±Z): timber, grain up
	if (w.z > 0.01) tap(timber_col, timber_nrm, timber_rgh, vec2(lp.x, lp.y) / timber_tile, X, Y, n, w.z, col, rgh, nrm);
	nrm = normalize(nrm);
	NORMAL = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(nrm, 0.0)).xyz);

	vec3 g = textureLod(albedo_tex, UV, 5.0).rgb;                    // Tripo's colour, blurred: where it is dirty and rusty
	float gl = dot(g, vec3(0.3, 0.59, 0.11));
	vec3 dirt = mix(vec3(1.0), g / max(gl, 0.05) * smoothstep(0.02, 0.35, gl) * 1.6, grime);
	vec3 wood = col * tint * clamp(dirt, 0.25, 1.3);
	float wrough = clamp(rgh * 0.55, 0.12, 0.9);                    // soaked: glossy
	// the fittings: above the rail (by height), in Tripo's own (rusty) colour, darkened wet
	vec3 sh = lp.x > 0.0 ? sheer_pos : sheer_neg;
	// (the rail's own top wanders a few cm round the fit: a face looking up counts only well above it)
	float above = lp.y - ((sh.x * lp.z + sh.y) * lp.z + sh.z);
	float iron = max(smoothstep(-0.015, 0.005, above) * (1.0 - smoothstep(0.75, 0.9, a.y)), smoothstep(0.06, 0.09, above));
	iron *= 1.0 - smoothstep(2.6, 2.9, abs(lp.z));
	vec3 rust = texture(albedo_tex, UV).rgb * vec3(0.55, 0.45, 0.4);
	ALBEDO = mix(wood, rust, iron);
	ROUGHNESS = mix(wrough, 0.5, iron);
	METALLIC = 0.6 * iron;
	SPECULAR = 0.5;
}
