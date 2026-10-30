import bpy, sys, bmesh
from mathutils import Vector
p = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=p)
for o in bpy.data.objects:
    print("OBJ", o.name, o.type, tuple(round(v,3) for v in o.location), tuple(round(v,3) for v in o.rotation_euler), tuple(round(v,3) for v in o.scale), o.parent.name if o.parent else None)
    if o.type=='MESH':
        me=o.data
        cs=[o.matrix_world@v.co for v in me.vertices]
        mn=Vector((min(c[i] for c in cs) for i in range(3))); mx=Vector((max(c[i] for c in cs) for i in range(3)))
        print("  verts",len(me.vertices),"tris",sum(len(f.vertices)-2 for f in me.polygons),"min",tuple(round(v,3) for v in mn),"max",tuple(round(v,3) for v in mx))
        print("  mats",[m.name for m in me.materials], "uvs",[u.name for u in me.uv_layers])
        bm=bmesh.new(); bm.from_mesh(me)
        import collections
        # islands
        bm.verts.ensure_lookup_table()
        seen=set(); isl=[]
        for v in bm.verts:
            if v.index in seen: continue
            stack=[v]; seen.add(v.index); comp=[]
            while stack:
                x=stack.pop(); comp.append(x.index)
                for e in x.link_edges:
                    y=e.other_vert(x)
                    if y.index not in seen: seen.add(y.index); stack.append(y)
            isl.append(comp)
        isl.sort(key=len, reverse=True)
        print("  islands",len(isl),[len(c) for c in isl[:15]])
for m in bpy.data.materials:
    if m.node_tree:
        print("MAT", m.name, [ (n.type, getattr(n,'image',None) and n.image.name) for n in m.node_tree.nodes])
