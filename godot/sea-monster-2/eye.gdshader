// 大海怪2 eye: a wet glassy black ball. Local +Y points out through the pupil
// (kraken.glb's eye_L / eye_R: Blender's +Z, which glTF turns into +Y).
shader_type spatial;
render_mode specular_schlick_ggx;

uniform sampler2D iris_tex : source_color, filter_linear_mipmap;
uniform float pupil = 0.62;   // pupil radius as a share of the iris

varying vec3 lp;

void vertex() {
	lp = normalize(VERTEX);
}

void fragment() {
	float r = length(lp.xz);                     // 0 at the pupil centre … 1 at the equator
	float front = step(0.0, lp.y);
	float iris_r = 0.78;
	vec3 iris = texture(iris_tex, lp.xz / iris_r * 0.5 + 0.5).rgb * 0.35;
	vec3 col = vec3(0.012, 0.012, 0.016);
	float in_iris = front * (1.0 - smoothstep(iris_r - 0.04, iris_r, r));
	float in_pupil = front * (1.0 - smoothstep(pupil * iris_r - 0.03, pupil * iris_r, r));
	col = mix(col, iris, in_iris);
	col = mix(col, vec3(0.0), in_pupil);
	// a dark ring of lid skin around the ball
	col = mix(col, vec3(0.09, 0.03, 0.025), smoothstep(0.86, 0.98, r) * front + (1.0 - front));
	NORMAL = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(lp, 0.0)).xyz);   // smooth ball over a low-poly sphere
	ALBEDO = col;
	ROUGHNESS = mix(0.05, 0.4, 1.0 - front);
	SPECULAR = 0.9;
	CLEARCOAT = 1.0;
	CLEARCOAT_ROUGHNESS = 0.03;
}
