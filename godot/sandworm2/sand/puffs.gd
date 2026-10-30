# 共用：做一組塵團粒子（CPUParticles3D＋dust_puff.gdshader）。dust.gd 與 devil.gd 都用它。
class_name SandPuffs

const PUFF_SHADER := preload("res://sand/dust_puff.gdshader")
const PUFF_TEX := preload("res://sand/textures/puff.png")
const GRAIN_TEX := preload("res://sand/textures/grain.png")
const STREAK_TEX := preload("res://sand/textures/streak.png")

# o: amount, life, size (min,max m), speed (min,max m/s), spread (deg), dir, gravity, radial, damping,
#    shape ("ring"/"sphere"/"box"), radius, inner, ring_h, box (Vector3), grow (from,to), fade (in,out), opacity
static func make(o: Dictionary) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = o.get("amount", 40)
	p.lifetime = o.get("life", 8.0)
	p.preprocess = p.lifetime * 1.2
	p.randomness = 0.5
	p.lifetime_randomness = 0.35
	p.explosiveness = 0.0
	p.local_coords = false
	p.draw_order = CPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	p.fixed_fps = 30
	p.fract_delta = true
	var q := QuadMesh.new()
	q.size = Vector2.ONE
	var m := ShaderMaterial.new()
	m.shader = PUFF_SHADER
	m.set_shader_parameter("puff", PUFF_TEX)
	m.set_shader_parameter("grain", GRAIN_TEX)
	m.set_shader_parameter("streak", STREAK_TEX)
	m.set_shader_parameter("grit", o.get("grit", 1.0))
	var gr: Vector2 = o.get("grow", Vector2(0.55, 1.4))
	m.set_shader_parameter("grow_from", gr.x)
	m.set_shader_parameter("grow_to", gr.y)
	var fd: Vector2 = o.get("fade", Vector2(0.15, 0.45))
	m.set_shader_parameter("fade_in", fd.x)
	m.set_shader_parameter("fade_out", fd.y)
	m.set_shader_parameter("opacity", o.get("opacity", 0.6))
	m.set_shader_parameter("ground_soft", o.get("ground_soft", 6.0))
	q.material = m
	p.mesh = q
	var sz: Vector2 = o.get("size", Vector2(20, 40))
	p.scale_amount_min = sz.x
	p.scale_amount_max = sz.y
	var sp: Vector2 = o.get("speed", Vector2(3, 8))
	p.initial_velocity_min = sp.x
	p.initial_velocity_max = sp.y
	p.direction = o.get("dir", Vector3.UP)
	p.spread = o.get("spread", 30.0)
	p.gravity = o.get("gravity", Vector3(0, -0.4, 0))
	p.radial_accel_min = o.get("radial", 0.0) * 0.5
	p.radial_accel_max = o.get("radial", 0.0)
	p.damping_min = o.get("damping", 0.2) * 0.5
	p.damping_max = o.get("damping", 0.2)
	p.angle_min = -180.0
	p.angle_max = 180.0
	p.angular_velocity_min = -6.0
	p.angular_velocity_max = 6.0
	match o.get("shape", "ring"):
		"ring":
			p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
			p.emission_ring_axis = Vector3.UP
			p.emission_ring_radius = o.get("radius", 50.0)
			p.emission_ring_inner_radius = o.get("inner", 0.0)
			p.emission_ring_height = o.get("ring_h", 0.0)
		"sphere":
			p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
			p.emission_sphere_radius = o.get("radius", 5.0)
		"box":
			p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
			p.emission_box_extents = o.get("box", Vector3.ONE)
	return p

static func mat(p: CPUParticles3D) -> ShaderMaterial:
	return (p.mesh as QuadMesh).material as ShaderMaterial
