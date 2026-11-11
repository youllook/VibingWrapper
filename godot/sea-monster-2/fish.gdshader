// 大海怪2 fish: countershaded (dark steel-blue back, mirror-silver flanks, white belly), lit from above.
// INSTANCE_CUSTOM: r = tail-beat phase 0..1, g = flash (a hard turn shows the flank).
shader_type spatial;
render_mode cull_disabled;

uniform float murk = 0.0;   // over the blue-black sea the dark backs would vanish: they go grey-green instead
// the swell, as water.gdshader has it (main.gd sets the same numbers on both): each fish keeps its depth under the
// moving surface. Worked out here once per vertex of ~100 fish instead of in GDScript, ten waves per fish per frame
// (2026-11-11: that was a fifth to a half of the script's time)
uniform vec4 wa[10];
uniform vec4 wb[10];
uniform float time = 0.0;
uniform vec2 drift = vec2(0.0);
uniform float swell = 0.0;

varying float side;          // 1 back … 0 flank … -1 belly
varying float flash;

void vertex() {
	// a wave from head to tail in the fish's own plane, about 7% of its length at the tail
	float x = VERTEX.x;
	float tailw = smoothstep(0.25, -0.6, x);
	VERTEX.z += sin(INSTANCE_CUSTOM.r * TAU - x * 6.0) * 0.07 * tailw;
	side = clamp(VERTEX.y / 0.12, -1.0, 1.0);
	flash = INSTANCE_CUSTOM.g;
	// the sea's height over this fish (its origin: the whole fish moves as one), added along the world's up axis —
	// the instance's basis is a rotation times its length, so world up in its own space is the basis' second row / length²
	vec2 q = MODEL_MATRIX[3].xz + drift;
	float h = 0.0;
	for (int i = 0; i < 10; i++) {
		h += wa[i].w * sin(wa[i].z * dot(wa[i].xy, q) - wb[i].y * time + wb[i].z);
	}
	mat3 m = mat3(MODEL_MATRIX);
	VERTEX += vec3(m[0].y, m[1].y, m[2].y) * (h * swell / max(dot(m[0], m[0]), 1e-12));
}

void fragment() {
	vec3 back = mix(vec3(0.04, 0.09, 0.16), vec3(0.32, 0.40, 0.38), murk);
	vec3 flank = vec3(0.62, 0.68, 0.72);
	vec3 belly = vec3(0.85, 0.87, 0.88);
	vec3 col = side > 0.0 ? mix(flank, back, smoothstep(0.1, 0.7, side)) : mix(flank, belly, smoothstep(-0.2, -0.8, side));
	ALBEDO = col;
	METALLIC = (1.0 - abs(side)) * 0.6;
	ROUGHNESS = mix(0.45, 0.2, 1.0 - abs(side));
	EMISSION = flank * flash * 0.35;
}
