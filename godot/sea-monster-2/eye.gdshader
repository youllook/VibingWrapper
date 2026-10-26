// 大海怪2 eye — 大海怪's hero eye (themes/sea-monster heroEye, from eye-lab.html), ray traced inside the eye's own
// sphere: a clear cornea bulging off the ball mirrors the sky and bends the view (n 1.336) onto the iris below it, so
// the iris shifts with the angle like a real one; the pupil's edge wavers and the fibres are squeezed outward as it
// opens; behind the pupil a lens with its own faint glint; round the cornea wet dark-red skin. Highlights stay weak
// (user 2026-10-26: just enough to show it is round).
// Mesh: kraken.glb's eye_L / eye_R, radius 0.27, local +Y out through the pupil (Blender's +Z). The eye frame E used
// below is the original's: unit ball, +Z through the pupil — E = (L.x, -L.z, L.y) / 0.27.
shader_type spatial;
render_mode cull_back, specular_schlick_ggx;

uniform sampler2D iris_tex : source_color, filter_linear_mipmap;
uniform float pupil = 0.45;                 // pupil radius as a share of the iris (0.3 tight … 0.8 wide)
uniform float lit = 1.0;                    // how much light is about (the sun's energy, dimmed with the murk)
uniform vec3 sun_to = vec3(-0.70, 0.45, -0.55);   // world direction toward the sun
// only the cornea is drawn: the ball round it is left out so the body's own socket shows, and the cornea's rim
// darkens into it — no pasted-on disc (user 2026-10-27: 剝離感)

const float R_MESH = 0.27;
const float ZI = 0.60;   // iris plane
const float RI = 0.66;   // iris radius
const float RC = 0.775;  // cornea sphere radius …
const vec3 CC = vec3(0.0, 0.0, 0.345);   // … and centre
const float RL = 0.30;   // lens
const vec3 CL = vec3(0.0, 0.0, 0.36);

varying vec3 lp;          // local position on the (slightly grown) mesh

void vertex() {
	VERTEX *= 1.13;       // the cornea bulges past the ball: grow the mesh so its pixels are drawn
	lp = VERTEX;
}

vec3 toE(vec3 l) { return vec3(l.x, -l.z, l.y); }
vec3 fromE(vec3 e) { return vec3(e.x, e.z, -e.y); }

float sphT(vec3 ro, vec3 rd, vec3 c, float r) {
	vec3 oc = ro - c;
	float b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q;
	if (h < 0.0) return -1.0;
	h = sqrt(h);
	float t = -b - h;
	if (t < 0.0) t = -b + h;
	return t > 0.0 ? t : -1.0;
}

// world direction → the light the wet eye mirrors: dark water below, a dim window of sky above, the sun
vec3 eyeSky(vec3 d) {
	vec3 c = mix(vec3(0.005, 0.012, 0.02), vec3(0.08, 0.13, 0.17), smoothstep(-0.1, 0.9, d.y));
	c += vec3(1.0, 0.96, 0.88) * 6.0 * pow(max(dot(d, normalize(sun_to)), 0.0), 400.0);
	c += vec3(0.75, 0.85, 0.95) * 1.2 * smoothstep(0.965, 0.985, dot(d, normalize(vec3(-0.35, 1.0, -0.45))));
	return c;
}

void fragment() {
	// the view ray in the eye frame (unit ball)
	mat4 inv = inverse(MODEL_MATRIX);
	vec3 ro_l = (inv * vec4(CAMERA_POSITION_WORLD, 1.0)).xyz;
	vec3 ro = toE(ro_l) / R_MESH;
	vec3 rd = normalize(toE(lp - ro_l));
	mat3 toWorld = mat3(normalize(MODEL_MATRIX[0].xyz), normalize(MODEL_MATRIX[1].xyz), normalize(MODEL_MATRIX[2].xyz));
	vec3 col;
	float tC = sphT(ro, rd, CC, RC);
	vec3 hC = ro + rd * tC;
	if (tC > 0.0 && hC.z > 0.74) {
		vec3 nC = normalize(hC - CC);
		float F = 0.025 + 0.975 * pow(1.0 - max(dot(-rd, nC), 0.0), 5.0);
		vec3 refl = eyeSky(toWorld * fromE(reflect(rd, nC)));
		vec3 rr = refract(rd, nC, 1.0 / 1.336);
		float ti = (ZI - hC.z) / rr.z;
		vec3 hi = hC + rr * ti;
		vec3 inside = vec3(0.01, 0.015, 0.02);
		if (ti > 0.0 && length(hi.xy) < RI) {
			float r = length(hi.xy) / RI, an = atan(hi.y, hi.x);
			float edge = pupil * (1.0 + 0.008 * sin(an * 7.0 + 1.3) + 0.006 * sin(an * 13.0 - TIME * 0.7));   // the edge wavers
			float pup = 1.0 - smoothstep(edge - 0.015, edge + 0.015, r);
			float tt = clamp((r - edge) / (1.0 - edge), 0.0, 1.0);   // fibres squeezed outward as the pupil opens
			vec3 ic = pow(texture(iris_tex, 0.5 + mix(0.277, 1.0, tt) * 0.477 * vec2(cos(an), -sin(an))).rgb, vec3(1.15));
			ic *= (1.0 - 0.85 * smoothstep(0.82, 1.0, tt)) * mix(0.55, 1.0, smoothstep(0.0, 0.08, tt));
			vec3 deep = vec3(0.0008, 0.0025, 0.0035);
			float tl = sphT(hi, rr, CL, RL);
			if (tl > 0.0) {                                           // the lens behind the pupil
				vec3 nl = normalize(hi + rr * tl - CL);
				float Fl = pow(1.0 - max(dot(-rr, nl), 0.0), 3.0);
				deep += eyeSky(toWorld * fromE(reflect(rr, nl))) * 0.015 * (0.3 + Fl) + vec3(0.0, 0.02, 0.025) * pow(1.0 - Fl, 3.0) * 0.12;
			}
			inside = mix(ic * 1.1, deep, pup);   // twice the original: it is seen through 3 m of dark water
		}
		inside = mix(inside, vec3(0.05, 0.09, 0.12), smoothstep(0.45, 0.7, length(hC.xy)) * 0.35);
		col = mix(inside, refl, F) + refl * 0.02;
		col = mix(col, vec3(0.012, 0.006, 0.006), 1.0 - smoothstep(0.74, 0.86, hC.z));   // the rim darkens into the socket
		ALBEDO = vec3(0.0);
		SPECULAR = 0.0;
		ROUGHNESS = 1.0;
		EMISSION = col * lit;
	} else {
		discard;
	}
}
