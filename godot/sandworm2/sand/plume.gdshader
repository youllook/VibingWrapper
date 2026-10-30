// 沙塵滾滾 flipbook：Blender 體積塵（sand/blender/plume.py）從主線固定鏡頭渲好的無縫循環，貼在一張「螢幕對齊」的網格上播。
// 圖集是預乘 alpha 的彩色（顏色就是 Blender 打好光的顏色），這裡只做曝光／色調微調與相鄰兩格交叉淡化。
// unshaded、不吃霧（同其他塵；預乘模式下霧會把透明處染色）。
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D atlas : filter_linear, repeat_disable;   // no mipmaps: they would bleed between cells
uniform int cols = 6;
uniform int rows = 10;
uniform int frames = 60;
uniform float frame = 0.0;          // current frame (float, wraps at `frames`), advanced by plume.gd
uniform float opacity = 1.0;
uniform float exposure = 1.0;       // × colour (linear)
uniform vec3 tint : source_color = vec3(1.0);
uniform float saturation = 1.0;
uniform float gamma = 1.0;          // atlas → linear: 2.2 = exact sRGB decode; lower keeps the Blender colours from turning red under Filmic
uniform float flat_mix = 0.0;          // 1 = debug looks (gray=1 / layers=1): one colour, keep the soft shape
uniform vec3 flat_color : source_color = vec3(0.7);

vec4 cell(int i, vec2 uv) {
	vec2 c = vec2(float(i % cols), float(i / cols));
	return texture(atlas, (c + uv) / vec2(float(cols), float(rows)));
}

void fragment() {
	vec2 ts = vec2(textureSize(atlas, 0)) / vec2(float(cols), float(rows));
	vec2 uv = clamp(UV, 0.5 / ts, 1.0 - 0.5 / ts);
	int i0 = int(floor(frame)) % frames;
	int i1 = (i0 + 1) % frames;
	vec4 a = mix(cell(i0, uv), cell(i1, uv), fract(frame));
	// the atlas is sRGB-encoded premultiplied colour: un-premultiply, to linear, grade, premultiply again
	float al = a.a;
	vec3 c = al > 0.002 ? a.rgb / al : vec3(0.0);
	c = pow(clamp(c, 0.0, 1.0), vec3(gamma));
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = max(mix(vec3(l), c, saturation), 0.0) * tint * exposure;
	c = mix(c, flat_color, flat_mix);
	// soft frame edges, in case a billow reaches the border of the render
	al *= smoothstep(0.0, 0.03, UV.x) * smoothstep(1.0, 0.97, UV.x) * smoothstep(0.0, 0.04, UV.y) * smoothstep(1.0, 0.99, UV.y);
	al *= opacity;
	ALBEDO = c * al;
	ALPHA = al;
}
