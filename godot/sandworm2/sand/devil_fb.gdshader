// 塵捲風 flipbook（導流線序列）：Blender 烘好的無縫循環（sand/blender/devil_render.py），一張只繞 Y 轉向鏡頭的板子播。
// 圖集：R＝預乘過的明暗（亮度 × alpha）、A＝透明度；顏色完全由 tint／shade／glow 決定（灰模也一樣吃）。
// 相鄰兩格交叉淡化，18 fps 的圖集播起來是平順的。unshaded、不吃霧（同其他塵）。
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D atlas : filter_linear, repeat_disable;   // no mipmaps: they would bleed between cells
uniform int cols = 12;
uniform int rows = 6;
uniform int frames = 72;
uniform float fps = 18.0;          // frames per second (72 frames / 4 s), × speed
uniform float phase = 0.0;         // 0–1 loop offset per instance
uniform float opacity = 1.0;
uniform vec3 tint : source_color = vec3(0.86, 0.62, 0.4);   // the lit dust
uniform vec3 shade : source_color = vec3(0.66, 0.42, 0.24);  // shadowed dust and the grains
uniform vec3 glow : source_color = vec3(1.0, 0.8, 0.56);    // backlit rim
uniform float rim = 1.0;           // 0–1.5: how much the brightest part reaches glow (set from the sun angle)
uniform float sway = 0.6;          // metres of extra bend at the top, on top of the baked sway
uniform float seed = 0.0;
uniform float quad_h = 30.0;       // quad height (m); the column's foot sits base_m above the quad's bottom
uniform float base_m = 2.47;
uniform float ground_soft = 0.8;   // metres: alpha fades in from the foot up (hides the cut against the sand)
uniform float flat_look = 0.0;          // 1 = debug looks: one colour, keep the shape

varying float hy;   // metres above the foot

void vertex() {
	hy = VERTEX.y;
	float t = clamp(VERTEX.y / max(quad_h - base_m, 1.0), 0.0, 1.0);
	float s = TIME * 0.35 + seed * 6.2831;
	VERTEX.x += (sin(s) * 0.75 + sin(s * 1.9 + 1.3) * 0.25) * sway * t * t;
	// cylindrical billboard: keep +Y up, turn the quad's normal toward the camera
	vec3 cam_x = MAIN_CAM_INV_VIEW_MATRIX[0].xyz;
	vec3 cam_z = MAIN_CAM_INV_VIEW_MATRIX[2].xyz;
	vec3 up = vec3(0.0, 1.0, 0.0);
	vec3 x = normalize(cross(up, cam_z));
	vec3 z = normalize(cross(x, up));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(x, 0.0), vec4(up, 0.0), vec4(z, 0.0), MODEL_MATRIX[3]);
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

vec4 cell(int i, vec2 uv) {
	vec2 c = vec2(float(i % cols), float(i / cols));
	return texture(atlas, (c + uv) / vec2(float(cols), float(rows)));
}

void fragment() {
	// inset half a texel so the bilinear filter never reaches the next cell
	vec2 ts = vec2(textureSize(atlas, 0)) / vec2(float(cols), float(rows));
	vec2 uv = clamp(UV, 0.5 / ts, 1.0 - 0.5 / ts);
	float f = TIME * fps + phase * float(frames);
	int i0 = int(floor(f)) % frames;
	int i1 = (i0 + 1) % frames;
	vec4 a = mix(cell(i0, uv), cell(i1, uv), fract(f));
	float al = a.a;
	float lum = al > 0.002 ? clamp(a.r / al, 0.0, 1.0) : 0.0;
	// lum (baked): grains and the shadowed side ~0.4–0.5, body ~0.72, sunlit/backlit edge ~0.85
	vec3 col = mix(shade, tint, smoothstep(0.4, 0.7, lum));
	col = mix(col, glow, clamp(smoothstep(0.74, 0.88, lum) * rim, 0.0, 1.0));
	col = mix(col, tint, flat_look);
	// soft foot and soft frame edges (anything the bake pushed to the border)
	al *= smoothstep(0.0, ground_soft, hy);
	al *= smoothstep(0.0, 0.05, UV.x) * smoothstep(1.0, 0.95, UV.x) * smoothstep(0.0, 0.04, UV.y);
	al *= opacity;
	ALBEDO = col * al;
	ALPHA = al;
}
