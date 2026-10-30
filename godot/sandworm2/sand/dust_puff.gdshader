// 塵團粒子（CPUParticles3D 用）：自己做 billboard、unshaded，顏色只吃 tint uniform —
// 粒子 RGB 在 Compatibility 會出現近黑的粒子，所以這裡完全不讀 COLOR.rgb，alpha 也由壽命（INSTANCE_CUSTOM.y）自己算。
// 逆光：朝太陽那一側邊緣、以及整團正對太陽時都變亮；最暗也只到 tint，不會有暗塊。
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;

uniform sampler2D puff : filter_linear_mipmap;   // 2×2 atlas, alpha = density
uniform sampler2D grain : filter_linear_mipmap, repeat_enable;   // R = speckle noise
uniform sampler2D streak : filter_linear_mipmap, repeat_enable;  // vertical sand-fall streaks
uniform float grit = 1.0;          // 0 = smooth smoke, 1 = gritty sand (speckle in alpha + darker flecks)
uniform float grit_scale = 0.3;    // speckle frequency (grain texture repeats per sprite)
uniform vec3 tint : source_color = vec3(0.85, 0.57, 0.32);   // body colour (#d89a5a area)
uniform vec3 shade : source_color = vec3(0.74, 0.45, 0.25);  // lower, sun-away side (still warm, never dark)
uniform vec3 glow : source_color = vec3(1.0, 0.74, 0.42);   // backlit rim / sun-side
uniform vec3 sun_dir = vec3(0.48, 0.06, -0.87);             // world, pointing toward the sun
uniform float opacity = 0.6;
uniform float size = 1.0;          // multiplies the particle scale
uniform float grow_from = 0.55;    // scale at birth → grow_to at death
uniform float grow_to = 1.4;
uniform float fade_in = 0.15;      // fraction of life
uniform float fade_out = 0.45;
uniform float ground_soft = 6.0;   // metres: fade the bottom of puffs where they meet the sand (y = ground_y)
uniform float ground_y = 0.0;

varying float life;
varying vec2 scr;       // screen-space offset from the puff centre, −1…1 (independent of the sprite's spin)
varying float cell;
varying float wy;
varying float fwd;      // how much this puff sits in front of the sun
varying float ang;
varying float rnd;

void vertex() {
	life = INSTANCE_CUSTOM.y;
	float s = length(MODEL_MATRIX[0].xyz) * size * mix(grow_from, grow_to, sqrt(clamp(life, 0.0, 1.0)));
	float a = INSTANCE_CUSTOM.x;
	ang = a;
	rnd = fract(float(INSTANCE_ID) * 0.6180339);
	vec2 v = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a))) * VERTEX.xy;
	scr = v * 2.0;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	VERTEX = vec3(v * s, 0.0);
	wy = MODEL_MATRIX[3].y + (INV_VIEW_MATRIX * vec4(VERTEX, 0.0)).y;
	cell = mod(float(INSTANCE_ID), 4.0);
	vec3 to_p = normalize(MODEL_MATRIX[3].xyz - INV_VIEW_MATRIX[3].xyz);
	fwd = max(dot(to_p, normalize(sun_dir)), 0.0);
}

void fragment() {
	vec2 off = vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
	float d = texture(puff, UV * 0.5 + off).a;
	vec3 sv = (VIEW_MATRIX * vec4(normalize(sun_dir), 0.0)).xyz;
	vec2 sun2 = length(sv.xy) > 0.001 ? normalize(sv.xy) : vec2(0.0, 1.0);
	// bottom of a billow a little deeper orange; the side facing the sun and the thin edges glow when backlit
	float low = clamp(0.5 - 0.5 * scr.y, 0.0, 1.0);
	// the sun direction in the sprite's own (spun) texture space; UV y runs down
	vec2 sq = mat2(vec2(cos(ang), -sin(ang)), vec2(sin(ang), cos(ang))) * sun2;
	vec2 su = vec2(sq.x, -sq.y) * 0.06;
	float dsun = texture(puff, clamp(UV + su * 2.0, 0.0, 1.0) * 0.5 + off).a;
	float lit = clamp((d - dsun) * 2.5 + 0.5, 0.0, 1.0);   // >0.5 on the edge facing the sun
	vec3 col = mix(shade, tint, clamp(0.35 + 0.65 * lit - low * 0.3, 0.0, 1.0));
	col = mix(col, glow, smoothstep(0.6, 0.95, lit) * 0.6);
	float thin = 1.0 - smoothstep(0.02, 0.3, d);
	float toward = clamp(dot(scr, sun2), 0.0, 1.0);
	float back = 0.3 + 0.7 * pow(fwd, 3.0);
	col = mix(col, glow, clamp(thin * back * (0.3 + 0.7 * toward) + toward * 0.15 * back + 0.15 * pow(fwd, 8.0), 0.0, 1.0));
	// grit: fine speckle eats into the alpha (most at the thin edges), plus a few darker grain flecks
	float edge = 1.0 - smoothstep(0.15, 0.7, d);
	vec2 gu = UV * grit_scale + vec2(rnd, cell * 0.25);
	float sp = texture(grain, gu).r;
	float sp2 = texture(grain, gu * 2.3 + vec2(0.5, 0.17)).r;
	float speck = mix(1.0, clamp(0.25 + 1.2 * sp, 0.0, 1.3), grit * (0.35 + 0.65 * edge));
	// heavier, denser body: a firmer silhouette (sand billows have defined lobes, smoke is wispy)
	d = mix(d, smoothstep(0.06, 0.42, d), grit * 0.75);
	float fleck = smoothstep(0.66, 0.82, sp2) * grit * (0.35 + 0.65 * edge);
	col = mix(col, shade * 0.86, fleck * 0.55);
	col = mix(col, glow, smoothstep(0.75, 0.95, sp) * grit * 0.25 * edge);
	d *= speck;
	// the underside of each billow rains sand: screen-vertical streaks (don't spin with the sprite) sliding down
	float under = smoothstep(0.15, -0.7, scr.y) * grit;
	float st = texture(streak, vec2(scr.x * 0.35 + rnd, scr.y * 0.12 + TIME * 0.25 + rnd)).r;
	d *= mix(1.0, 0.35 + 1.0 * st, under * 0.8);
	col = mix(col, shade, under * 0.25);
	ALBEDO = col;
	float fade = smoothstep(0.0, fade_in, life) * (1.0 - smoothstep(1.0 - fade_out, 1.0, life));
	float gs = ground_soft > 0.0 ? smoothstep(ground_y, ground_y + ground_soft, wy) : 1.0;
	ALPHA = clamp(d * opacity * fade * gs, 0.0, 1.0);
}
