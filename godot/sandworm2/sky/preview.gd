# sky family preview: a 50° camera (the main scene's) with the far backdrop under it.
extends Node3D

func _ready() -> void:
	Look.plain_env(self, Look.mode())
	Look.apply(self, Look.mode(), "far")
