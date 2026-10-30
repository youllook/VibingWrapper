# 岩柱 helper — six spires split from rock_spires.glb (tools/build_models.py), one glTF each under spires/,
# all sharing spires/spires_basecolor.jpg. Each: base on y = 0, origin = centre of its base footprint.
#   var s := Spires.make(3, 50.0, 0.7)   # spire 3 scaled to 50 m tall, yawed 0.7 rad
class_name Spires

const COUNT := 6
# native height (m) and footprint half-extents (x, z) in metres
const HEIGHT := [39.67, 56.71, 34.06, 70.0, 45.56, 48.95]
const HALF := [Vector2(15.9, 20.1), Vector2(20.8, 22.7), Vector2(16.0, 19.1), Vector2(17.9, 19.2), Vector2(18.6, 20.1), Vector2(18.1, 18.3)]

static func scene(i: int) -> PackedScene:
	return load("res://rocks/spires/spire_%d.gltf" % (i % COUNT))

# height <= 0 keeps the native size; scale is uniform
static func make(i: int, height := 0.0, yaw := 0.0) -> Node3D:
	var n := scene(i).instantiate() as Node3D
	n.name = "Spire%d" % (i % COUNT)
	if height > 0.0:
		n.scale = Vector3.ONE * (height / HEIGHT[i % COUNT])
	n.rotation.y = yaw
	return n
