// 大海怪2 fish: countershaded (dark steel-blue back, mirror-silver flanks, white belly), lit from above.
// INSTANCE_CUSTOM: r = tail-beat phase 0..1, g = flash (a hard turn shows the flank).
shader_type spatial;
render_mode cull_disabled;

uniform float murk = 0.0;   // over the blue-black sea the dark backs would vanish: they go grey-green instead

varying float side;          // 1 back … 0 flank … -1 belly
varying float flash;

void vertex() {
	// a wave from head to tail in the fish's own plane, about 7% of its length at the tail
	float x = VERTEX.x;
	float tailw = smoothstep(0.25, -0.6, x);
	VERTEX.z += sin(INSTANCE_CUSTOM.r * TAU - x * 6.0) * 0.07 * tailw;
	side = clamp(VERTEX.y / 0.12, -1.0, 1.0);
	flash = INSTANCE_CUSTOM.g;
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
