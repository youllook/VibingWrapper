// 大海怪3 sea: a storm sea seen from a small boat, the camera a couple of metres above the water.
// Geometry is a projected grid: the mesh is a grid in screen space (x, z = NDC), each vertex is cast from the camera
// onto the water plane and then moved by a sum of Gerstner waves (main.gd owns the wave list, so the boat can ride
// the same sea on the CPU), so the detail stays even from the gunwale to the horizon. On top: the mound the squid
// heaves up as it rises (`heave`), ring waves running out from where it broke the surface, and churn round its head.
// Shading is by hand (unshaded): sky reflection with Fresnel, light through the thin wave crests, what is under the
// surface refracted and swallowed by murky water, and foam — on crests that fold over (Gerstner Jacobian), where the
// water touches the squid (depth buffer), and in the churn round its head — broken up by a foam lace texture.
shader_type spatial;
render_mode unshaded, cull_disabled, world_vertex_coords, depth_draw_always, shadows_disabled;

const int NW = 12;
const bool DBG_FACES = false;   // tests: tint the water by its grid row
uniform vec4 wa[NW];          // dir.x, dir.z, wavelength (m), amplitude (m)
uniform vec4 wb[NW];          // steepness Q (0…1), phase, 0, 0
uniform float time_s = 0.0;   // main.gd's clock (the boat samples the same waves)

uniform vec3 head_pos = vec3(4.5, 0.0, -14.0);  // where the squid breaks the surface
uniform float head_r = 5.0;                     // its radius at the water line
uniform float heave = 0.0;                      // height of the mound over it (m)
uniform float churn = 0.0;                      // 0 … 1: chop and foam round its head
uniform float ring_t = 99.0;                    // seconds since it broke the surface (ring waves)
uniform float foam_k = 1.0;                     // how readily crests foam (calm sea: none)
uniform mat4 boat_inv;                          // world → the boat's frame: no water drawn inside its hull
uniform vec3 hull = vec3(3.1, 1.15, 0.75);      // half length (x), half beam (z), gunwale height over the origin

uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform sampler2D ripple : filter_linear_mipmap, repeat_enable;   // textures/ripple.png: RG = slope/rms/8+.5
uniform sampler2D foam_tex : filter_linear_mipmap, repeat_enable; // textures/foam.png: R lace, G coverage, B bubbles

uniform vec3 sky_top : source_color = vec3(0.20, 0.23, 0.26);
uniform vec3 sky_hor : source_color = vec3(0.50, 0.54, 0.56);
uniform vec3 deep_col : source_color = vec3(0.010, 0.026, 0.032);
uniform vec3 crest_col : source_color = vec3(0.05, 0.16, 0.15);  // light through a thin crest
uniform vec3 sun_to = vec3(-0.3, 0.6, -0.75);
uniform float sun_k = 0.25;   // overcast: a weak, broad sheen
uniform float light_k = 1.0;  // the whole scene's light (darker as the storm comes)

varying vec3 wpos;
varying vec3 wnorm;
varying float jac;
varying float hgt;
varying float dist;
varying float gy;

vec3 skyc(vec3 d) {
	return mix(sky_hor, sky_top, smoothstep(0.0, 0.5, d.y)) * light_k;
}

void vertex() {
	vec2 ndc = VERTEX.xz;
	gy = ndc.y;
	vec4 vp = INV_PROJECTION_MATRIX * vec4(ndc, 0.5, 1.0);
	vec3 vd = normalize(vp.xyz / vp.w);
	vec3 rd = (INV_VIEW_MATRIX * vec4(vd, 0.0)).xyz;
	vec3 co = INV_VIEW_MATRIX[3].xyz;
	rd.y = min(rd.y, -0.003);                     // above the horizon: pin to it
	float tt = min((co.y + 0.0) / -rd.y, 6000.0);
	vec2 p = co.xz + rd.xz * tt;
	dist = tt;

	vec3 P = vec3(p.x, 0.0, p.y);
	float lee = mix(0.4, 1.0, smoothstep(4.0, 16.0, length(p)));   // main.gd's LEE: lower waves round the boat
	// how far apart the grid's vertices land here: seen at a grazing angle from a camera a couple of metres up, about
	// distance² × (the grid's angular step) / height
	float spacing = tt * tt * 0.0035 / max(co.y, 1.0);
	float sx = 0.0, sz = 0.0, jxx = 1.0, jzz = 1.0, jxz = 0.0, ny = 1.0;
	for (int i = 0; i < NW; i++) {
		vec4 a = wa[i];
		float L = a.z;
		float fade = 1.0 - smoothstep(L * 0.12, L * 0.3, spacing);   // a wave the grid can't hold would alias into spikes
		if (fade <= 0.0) continue;
		float A = a.w * fade * lee, k = 6.2831853 / L, w = sqrt(9.81 * k), Q = wb[i].x * (1.0 - 0.8 * smoothstep(25.0, 160.0, tt));   // far crests rounder
		vec2 D = a.xy;
		float th = k * dot(D, p) - w * time_s + wb[i].y;
		float c = cos(th), s = sin(th);
		P.x += Q * A * D.x * c;
		P.z += Q * A * D.y * c;
		P.y += A * s;
		float kA = k * A;
		sx += D.x * kA * c;
		sz += D.y * kA * c;
		ny -= Q * kA * s;
		jxx -= Q * kA * D.x * D.x * s;
		jzz -= Q * kA * D.y * D.y * s;
		jxz -= Q * kA * D.x * D.y * s;
	}
	// the squid: a mound over it, rings running out from where it broke through, chop round its head
	vec2 hd = p - head_pos.xz;
	float r = length(hd);
	float mR = head_r * 2.6;
	float mound = heave * exp(-r * r / (mR * mR));
	float rr = r - head_r - ring_t * 6.0;
	float ring = 0.9 * exp(-rr * rr / 18.0) * sin(rr * 0.9) * exp(-ring_t * 0.25) * step(0.0, ring_t);
	float ch = churn * exp(-pow(max(r - head_r, 0.0) / (head_r * 1.4), 2.0));
	// churn: smooth lumps of water heaving round the head (the foam map's soft coverage noise, not the ripple slopes,
	// which make rocky peaks)
	vec2 q = p * 0.035 + vec2(time_s * 0.05, -time_s * 0.04);
	float chop = (textureLod(foam_tex, q, 0.0).g - 0.5) * 1.6 + (textureLod(foam_tex, q * 2.1 + 0.37, 0.0).g - 0.5) * 0.6;
	P.y += mound + ring + ch * chop * 0.8;
	// their slopes, by finite differences of the analytic shapes (cheap enough per vertex)
	float dm = -2.0 * r / (mR * mR) * mound;
	float dr = 0.9 * exp(-rr * rr / 18.0) * exp(-ring_t * 0.25) * step(0.0, ring_t) * (0.9 * cos(rr * 0.9) - rr / 9.0 * sin(rr * 0.9));
	vec2 gdir = r > 0.001 ? hd / r : vec2(0.0);
	sx += (dm + dr) * gdir.x;
	sz += (dm + dr) * gdir.y;
	jac = jxx * jzz - jxz * jxz - ch * 0.8 * max(chop + 0.25, 0.0);
	hgt = P.y;
	wpos = P;
	wnorm = normalize(vec3(-sx, max(ny, 0.2), -sz));
	VERTEX = P;
	NORMAL = wnorm;
}

// view-space distance to whatever the depth buffer holds at uv
float scene_z(vec2 uv, mat4 ip) {
	float dz = texture(depth_tex, uv).r;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(uv, dz) * 2.0 - 1.0;
#else
	vec3 ndc = vec3(uv * 2.0 - 1.0, dz);
#endif
	vec4 vp = ip * vec4(ndc, 1.0);
	return -vp.z / vp.w;
}

void fragment() {
	// inside the hull there is no sea (the boat rides lower than the water round it in a trough)
	vec3 bl = (boat_inv * vec4(wpos, 1.0)).xyz;
	vec2 hq = bl.xz / hull.xy;
	if (dot(hq, hq) < 1.0) discard;
	vec3 co = INV_VIEW_MATRIX[3].xyz;
	vec3 V = normalize(co - wpos);
	float d = length(co - wpos);
	// fine ripples on the big waves, fading out with distance
	vec2 g = vec2(0.0);
	float rk = 1.0 - smoothstep(30.0, 250.0, d);
	g += (texture(ripple, wpos.xz / 9.0 + vec2(0.13, 0.07) * time_s).rg - 0.5) * 0.9;
	g += (texture(ripple, wpos.xz / 3.7 + vec2(-0.21, 0.11) * time_s).rg - 0.5) * 0.7;
	vec3 n = normalize(wnorm + vec3(-g.x, 0.0, -g.y) * rk * (0.35 + 0.65 * foam_k));
	if (!FRONT_FACING) n = -n;
	float nv = max(dot(n, V), 0.0);
	float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
	vec3 R = reflect(-V, n);
	R.y = abs(R.y);
	vec3 refl = skyc(R);
	vec3 S = normalize(sun_to);
	refl += vec3(1.0, 0.97, 0.92) * sun_k * light_k * (pow(max(dot(R, S), 0.0), 24.0) * 0.6 + pow(max(dot(R, S), 0.0), 400.0) * 3.0);

	// under the surface: the screen behind, bent by the waves, swallowed by murky water
	vec2 suv = SCREEN_UV + n.xz * 0.04 * (1.0 - smoothstep(10.0, 80.0, d));
	float here = -VERTEX.z;
	float thick = max(scene_z(suv, INV_PROJECTION_MATRIX) - here, 0.0);
	float thick0 = max(scene_z(SCREEN_UV, INV_PROJECTION_MATRIX) - here, 0.0);
	// something in front of the water at the bent uv (the edge of the boat): don't pull it in — and take the depth from
	// the unbent uv too, or the water reads as zero deep and shows the bright sky behind it as a blue fringe round the
	// boat's fittings (user 2026-10-30)
	if (thick < 0.01) { suv = SCREEN_UV; thick = thick0; }
	vec3 under = texture(screen_tex, suv).rgb;
	vec3 body = deep_col * light_k;
	float thin = pow(1.0 - nv, 2.0) * smoothstep(-0.5, 1.6, hgt);
	body += crest_col * light_k * thin * 1.4;                    // light through the crests
	vec3 water = mix(under * vec3(0.35, 0.55, 0.55), body, 1.0 - exp(-thick * 0.55));
	vec3 col = mix(water, refl, F);

	// foam
	vec2 fq = wpos.xz;
	vec2 warp = (texture(ripple, fq / 23.0 + 0.01 * time_s).rg - 0.5) * 6.0;
	fq += warp;
	vec2 wind = normalize(vec2(-0.42, 0.91));
	vec2 fs = vec2(dot(fq, wind) * 0.55, dot(fq, vec2(wind.y, -wind.x)));   // streaks along the wind
	vec4 ft = texture(foam_tex, fs / 9.0 + vec2(0.02, 0.01) * time_s);
	vec4 ft2 = texture(foam_tex, fq / 3.1 - vec2(0.015, 0.03) * time_s);
	vec4 ft3 = texture(foam_tex, fq / 1.3 + vec2(0.04, -0.02) * time_s);
	float crest = clamp((0.75 - jac) * 1.6, 0.0, 1.0) * foam_k;
	float drift = smoothstep(0.55, 0.85, ft.g) * 0.35 * foam_k;  // old foam lying in streaks
	float contact = (1.0 - smoothstep(0.05, 0.9, thick0)) * step(0.001, thick0);
	vec2 hd = wpos.xz - head_pos.xz;
	float r = length(hd);
	float ring_f = churn * exp(-pow(max(r - head_r, 0.0) / (head_r * 0.9), 2.0));
	float cov = crest + drift + contact * (0.6 + churn) + ring_f * 1.2;
	float lace = ft.r * 0.45 + ft2.r * 0.35 + ft3.r * 0.25 + ft3.b * 0.25 + (ft.g - 0.5) * 0.4;
	float fm = smoothstep(1.0 - cov, 1.25 - cov * 0.8, lace) * min(cov * 1.5, 1.0);
	fm = max(fm, smoothstep(1.2, 1.8, cov));              // so much it is solid white
	vec3 foam = vec3(0.80, 0.83, 0.85) * light_k * (0.55 + 0.45 * max(n.y, 0.0));
	col = mix(col, foam, clamp(fm, 0.0, 1.0) * (1.0 - smoothstep(150.0, 500.0, d) * 0.6));

	// the far sea melts into the rain haze
	col = mix(col, sky_hor * light_k * 0.92, 1.0 - exp(-d * 0.0035));
	ALBEDO = col;
	if (DBG_FACES) ALBEDO = mix(ALBEDO, vec3(fract(gy * 2.0), 0.0, step(gy, -1.0)), 0.6);
}
