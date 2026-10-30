// 大海怪3 lens: what makes it read as a film still rather than a game — water drops sitting on the lens (blurring
// what is behind them), a cold low-saturation grade with warm hues kept, vignette and grain. A full-screen canvas pass
// over the finished 3D frame. The near gunwale stays sharp (user 2026-10-30: more detail on the near boat; the
// fisherman it used to blur with is gone).
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float blur_px = 9.0;                 // a drop's blur radius at 1080p
uniform float drops = 0.0;                   // 0 … 1: water drops on the lens
uniform float grain = 0.035;
uniform float time_s = 0.0;
uniform float sat = 0.62;                    // the grade
uniform vec3 shadow_tint = vec3(0.90, 1.0, 1.04);
uniform vec3 high_tint = vec3(1.03, 1.0, 0.96);

float h21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
vec2 h22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

// drops on the lens: a jittered grid of round drops of mixed sizes; each bends the view behind it (a little lens,
// upside down) and has a dark rim and a highlight; returns the uv offset and the rim/highlight shading
vec3 lens_drops(vec2 uv, float aspect, float amount) {
	vec2 q = vec2(uv.x * aspect, uv.y) * 7.0;
	vec2 cell = floor(q);
	vec3 o = vec3(0.0);
	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 c = cell + vec2(float(i), float(j));
			float alive = h21(c + 17.3);
			if (alive > amount * 0.45) continue;
			vec2 ctr = c + 0.2 + 0.6 * h22(c);
			float r = mix(0.06, 0.34, pow(h21(c + 3.1), 2.0));
			vec2 d = (q - ctr) / r;
			float l = length(d);
			if (l < 1.0) {
				float z = sqrt(1.0 - l * l);
				float edge = smoothstep(1.0, 0.6, l);                  // soft-edged: the drop itself is out of focus
				o.xy = -d * (1.0 - z) * r * 0.02 * edge;               // bends the view a little
				o.z = (0.06 + 0.1 * smoothstep(0.6, 0.0, length(d - vec2(-0.3, 0.35)))) * edge;
			}
		}
	}
	return o;
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 px = SCREEN_PIXEL_SIZE;
	float aspect = px.y / px.x;
	vec3 dr = lens_drops(uv, aspect, drops);
	uv += dr.xy;
	float coc = smoothstep(0.0, 0.05, dr.z) * 0.8;                     // a drop blurs what is behind it
	vec3 col = texture(screen_tex, uv).rgb;
	if (coc > 0.01) {
		float rad = blur_px * coc * (px.y * 1080.0);
		vec3 acc = col;
		float wsum = 1.0;
		for (int k = 0; k < 20; k++) {
			float a = float(k) * 2.39996;
			float rr = sqrt((float(k) + 0.5) / 20.0);
			vec2 off = vec2(cos(a), sin(a)) * rr * rad * px;
			acc += texture(screen_tex, uv + off).rgb;
			wsum += 1.0;
		}
		col = acc / wsum;
	}
	col *= 1.0 + dr.z;
	// grade: cold, low saturation; the warm eye keeps some of its colour (warm hues lose less)
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	float warm = smoothstep(0.02, 0.12, col.r - col.b);
	col = mix(vec3(lum), col, sat + 0.3 * warm);
	col *= mix(shadow_tint, high_tint, smoothstep(0.05, 0.6, lum));
	col = (col - 0.5) * 1.06 + 0.5;
	// vignette, grain
	vec2 v = SCREEN_UV - 0.5;
	col *= 1.0 - 0.55 * pow(length(v * vec2(1.0, 1.2)), 2.2);
	col += (h21(FRAGCOORD.xy + fract(time_s * 13.7) * 311.0) - 0.5) * grain;
	COLOR = vec4(max(col, 0.0), 1.0);
}
