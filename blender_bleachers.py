"""
Bleachers + Court + Teqboard Generator for Blender 4.x
========================================================
Run from Blender's Scripting tab.
Generates bleachers on all 4 sides, the court floor, and the teqball table.
Nothing existing is touched.

Collections created:
  Bleachers  — gradins 4 côtés
  Court      — surface de jeu
  Teqboard   — table de teqball (surface courbée + filet + pieds)

Coordinate system (Blender):
  X → left/right   Y → front/back   Z → up
  BabylonJS X = Blender X
  BabylonJS Z = Blender Y  (Y-Up export handles the swap)

All dimensions from main.ts unless noted.
"""

import bpy
import bmesh
import math

# ══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS  —  all in metres
# ══════════════════════════════════════════════════════════════════════════════

# ── Court (from main.ts: CreateGround 12×16, walls at ±6 and ±8) ─────────────
COURT_HX   = 6.0   # half-width  along X
COURT_HY   = 8.0   # half-length along Y  (= BabylonJS Z)
FLOOR_T    = 0.05  # floor slab thickness

# ── Bleacher rows ─────────────────────────────────────────────────────────────
N_ROWS     = 6
ROW_DEPTH  = 0.85
ROW_RISE   = 0.42
RISER_T    = 0.06
TREAD_T    = 0.06

# ── Individual seats ──────────────────────────────────────────────────────────
SEAT_W     = 0.52
SEAT_D     = 0.66   # fraction of ROW_DEPTH used by seat+back block
SEAT_H     = 0.40
BLUE_ROWS  = 4      # rows 0‥BLUE_ROWS-1 → blue, rest → red

# ── Teqboard (official dimensions) ───────────────────────────────────────────
TB_LEN     = 3.00   # length along Y
TB_W       = 1.70   # width  along X
TB_Z_MID   = 0.76   # surface height at X=0   (centre of width)
TB_Z_EDGE  = 0.565  # surface height at X=±TB_W/2  (long edges)
TB_TOP_T   = 0.04   # table-top slab thickness
TB_NET_H   = 0.14   # net height
TB_NET_T   = 0.008  # net thickness (plexiglass)
TB_LEG_W   = 0.06   # leg cross-section (square)

# ══════════════════════════════════════════════════════════════════════════════
#  DERIVED VALUES
# ══════════════════════════════════════════════════════════════════════════════

LONG_SPAN   = COURT_HY * 2   # 16 m — East/West bleacher length along Y
SHORT_SPAN  = COURT_HX * 2   # 12 m — North/South bleacher length along X
BANK_DEPTH  = N_ROWS * ROW_DEPTH
BANK_HEIGHT = N_ROWS * ROW_RISE

# Parabola coefficient for the curved table top: z(y) = TB_PARA * y² + TB_Z_MID
# The arch runs along Y (the 3 m LENGTH): high at centre (net), low at the ends.
# Passes through (y=0, z=TB_Z_MID) and (y=±TB_LEN/2, z=TB_Z_EDGE).
TB_PARA = (TB_Z_EDGE - TB_Z_MID) / (TB_LEN / 2) ** 2  # ≈ −0.0867 m⁻²

# ══════════════════════════════════════════════════════════════════════════════
#  COLLECTIONS
# ══════════════════════════════════════════════════════════════════════════════

def get_or_make_col(name, parent=None):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c

col_bleach = get_or_make_col('Bleachers')
col_court  = get_or_make_col('Court')
col_table  = get_or_make_col('Teqboard')

# ══════════════════════════════════════════════════════════════════════════════
#  MATERIALS
# ══════════════════════════════════════════════════════════════════════════════

def _spec_key(bsdf):
    return 'Specular IOR Level' if 'Specular IOR Level' in bsdf.inputs else 'Specular'

def pbr(name, rgb, rough=0.80, metal=0.0, spec=0.0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial'); out.location  = (300, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (0, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value  = rough
    bsdf.inputs['Metallic'].default_value   = metal
    bsdf.inputs[_spec_key(bsdf)].default_value = spec
    return mat

# Bleachers
M_STRUCT   = pbr('BLCH_Structure', (0.22, 0.23, 0.25), rough=0.70, metal=0.40)
M_SEAT_BLU = pbr('BLCH_Seat_Blue', (0.04, 0.12, 0.55), rough=0.55)
M_SEAT_RED = pbr('BLCH_Seat_Red',  (0.68, 0.06, 0.06), rough=0.55)

# Court floor — blue sport surface
M_COURT = pbr('COURT_Surface', (0.05, 0.18, 0.55), rough=0.72)

# Teqboard
M_TB_TOP  = pbr('TB_Top',  (0.04, 0.14, 0.50), rough=0.28, spec=0.50)  # dark blue play surface
M_TB_BODY = pbr('TB_Body', (0.18, 0.18, 0.20), rough=0.65, metal=0.50) # metal frame
M_TB_LEG  = pbr('TB_Leg',  (0.14, 0.14, 0.16), rough=0.45, metal=0.70) # darker metal legs
M_TB_NET  = pbr('TB_Net',  (0.80, 0.90, 0.95), rough=0.05, spec=0.90)  # plexiglass

# ══════════════════════════════════════════════════════════════════════════════
#  GEOMETRY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def make_box(name, loc, sx, sy, sz, mat=None, col=None):
    """
    Solid box centred at loc, dimensions sx × sy × sz.
    col defaults to col_bleach so existing bleacher calls need no change.
    """
    target = col or col_bleach
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = bpy.data.meshes.new(name)
    bm.to_mesh(m)
    bm.free()
    obj = bpy.data.objects.new(name, m)
    obj.location = loc
    obj.scale = (sx, sy, sz)
    target.objects.link(obj)
    if mat:
        m.materials.append(mat)
    return obj

def make_mesh_obj(name, bm_in, col, mat=None):
    """Convert a bmesh to a scene object linked to col."""
    bmesh.ops.recalc_face_normals(bm_in, faces=bm_in.faces)
    m = bpy.data.meshes.new(name)
    bm_in.to_mesh(m)
    bm_in.free()
    obj = bpy.data.objects.new(name, m)
    col.objects.link(obj)
    if mat:
        m.materials.append(mat)
    return obj

# ══════════════════════════════════════════════════════════════════════════════
#  BLEACHER BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def build_bank(label, span, inner_offset, axis):
    """
    Build both sides of a bleacher bank.
    axis='X': bank steps along ±X, seats span along Y  (East/West)
    axis='Y': bank steps along ±Y, seats span along X  (North/South)
    """
    for sign, side in ((+1, 'Pos'), (-1, 'Neg')):
        prefix = f'{label}_{side}'

        for row in range(N_ROWS):
            d_inner = inner_offset + row * ROW_DEPTH
            d_outer = d_inner + ROW_DEPTH
            d_mid   = (d_inner + d_outer) / 2
            z_base  = row * ROW_RISE
            z_top   = z_base + ROW_RISE

            if axis == 'X':
                riser_loc  = (sign * d_inner, 0.0, z_base + ROW_RISE / 2)
                riser_dims = (RISER_T, span, ROW_RISE)
                tread_loc  = (sign * d_mid, 0.0, z_top - TREAD_T / 2)
                tread_dims = (ROW_DEPTH, span, TREAD_T)
                seat_x     = sign * (d_inner + ROW_DEPTH * 0.50)
                seat_loc_fn = lambda si: (seat_x,
                                          -span/2 + SEAT_W/2 + si*SEAT_W,
                                          z_top + SEAT_H / 2)
                seat_dims  = (ROW_DEPTH * SEAT_D, SEAT_W * 0.84, SEAT_H)
            else:
                riser_loc  = (0.0, sign * d_inner, z_base + ROW_RISE / 2)
                riser_dims = (span, RISER_T, ROW_RISE)
                tread_loc  = (0.0, sign * d_mid, z_top - TREAD_T / 2)
                tread_dims = (span, ROW_DEPTH, TREAD_T)
                seat_y     = sign * (d_inner + ROW_DEPTH * 0.50)
                seat_loc_fn = lambda si: (-span/2 + SEAT_W/2 + si*SEAT_W,
                                          seat_y,
                                          z_top + SEAT_H / 2)
                seat_dims  = (SEAT_W * 0.84, ROW_DEPTH * SEAT_D, SEAT_H)

            make_box(f'{prefix}_Riser_{row}', riser_loc, *riser_dims, mat=M_STRUCT)
            make_box(f'{prefix}_Tread_{row}', tread_loc, *tread_dims, mat=M_STRUCT)

            seat_mat = M_SEAT_BLU if row < BLUE_ROWS else M_SEAT_RED
            for si in range(int(span / SEAT_W)):
                make_box(f'{prefix}_Seat_{row}_{si}',
                         seat_loc_fn(si), *seat_dims, mat=seat_mat)

        # Support wedge under the whole bank
        if axis == 'X':
            sup_loc  = (sign * (inner_offset + BANK_DEPTH / 2), 0.0, BANK_HEIGHT / 4)
            sup_dims = (BANK_DEPTH, span, BANK_HEIGHT / 2)
        else:
            sup_loc  = (0.0, sign * (inner_offset + BANK_DEPTH / 2), BANK_HEIGHT / 4)
            sup_dims = (span, BANK_DEPTH, BANK_HEIGHT / 2)

        make_box(f'{label}_{side}_Support', sup_loc, *sup_dims, mat=M_STRUCT)

# ══════════════════════════════════════════════════════════════════════════════
#  COURT FLOOR
# ══════════════════════════════════════════════════════════════════════════════

def build_court():
    make_box('Court_Floor',
             (0.0, 0.0, -FLOOR_T / 2),
             COURT_HX * 2, COURT_HY * 2, FLOOR_T,
             mat=M_COURT, col=col_court)

# ══════════════════════════════════════════════════════════════════════════════
#  TEQBOARD
# ══════════════════════════════════════════════════════════════════════════════

def build_teqboard():
    """
    Teqboard — official dimensions:
      Length : 3.00 m along Y   Width : 1.70 m along X
      z(y) = TB_PARA·y² + TB_Z_MID
        → z = 0.76 m at y=0 (centre / net)   ← highest point
        → z = 0.565 m at y=±1.5 m (ends)     ← lowest point
      The arch runs along the LENGTH (Y).  The cross-section along X is flat.
      Net (plexiglass): 14 cm tall, spans full width at Y=0.
    """
    hw = TB_W / 2    # 0.85 m — half-width
    hl = TB_LEN / 2  # 1.50 m — half-length
    NX = 16          # subdivisions across width  (flat → fewer needed)
    NY = 40          # subdivisions along length  (curved → more needed)

    # ── 1. Curved playing surface (closed shell, thickness TB_TOP_T) ──────────
    bm = bmesh.new()
    top_v = []
    bot_v = []

    for iy in range(NY + 1):
        y      = -hl + iy * TB_LEN / NY
        z_surf = TB_PARA * y ** 2 + TB_Z_MID   # arch along Y — flat across X
        top_row, bot_row = [], []
        for ix in range(NX + 1):
            x = -hw + ix * TB_W / NX
            top_row.append(bm.verts.new((x, y, z_surf)))
            bot_row.append(bm.verts.new((x, y, z_surf - TB_TOP_T)))
        top_v.append(top_row)
        bot_v.append(bot_row)

    bm.verts.ensure_lookup_table()

    # Top surface quads
    for iy in range(NY):
        for ix in range(NX):
            bm.faces.new([top_v[iy][ix],    top_v[iy][ix + 1],
                          top_v[iy+1][ix+1], top_v[iy+1][ix]])

    # Bottom surface quads (reversed winding → normals point downward)
    for iy in range(NY):
        for ix in range(NX):
            bm.faces.new([bot_v[iy][ix],    bot_v[iy+1][ix],
                          bot_v[iy+1][ix+1], bot_v[iy][ix+1]])

    # Short end-caps at Y = ±hl (flat rectangles across the width)
    for ix in range(NX):
        bm.faces.new([top_v[0][ix],    bot_v[0][ix],
                      bot_v[0][ix+1],  top_v[0][ix+1]])
        bm.faces.new([top_v[NY][ix+1], bot_v[NY][ix+1],
                      bot_v[NY][ix],   top_v[NY][ix]])

    # Long side-caps at X = ±hw (curved strips that follow the arch)
    for iy in range(NY):
        bm.faces.new([top_v[iy][0],   top_v[iy+1][0],
                      bot_v[iy+1][0], bot_v[iy][0]])
        bm.faces.new([top_v[iy][NX],  bot_v[iy][NX],
                      bot_v[iy+1][NX], top_v[iy+1][NX]])

    make_mesh_obj('Teqboard_Top', bm, col_table, mat=M_TB_TOP)

    # ── 2. Orange edge trim — follows the arch along both long sides ──────────
    # Approximated with NF short box segments that step along the curve.
    NF        = 14
    TRIM_T    = 0.045   # trim thickness (outward from surface edge)
    TRIM_H    = 0.06    # trim height (downward from surface underside)
    for sx in (+1, -1):
        label = 'E' if sx > 0 else 'W'
        for fi in range(NF):
            y0    = -hl + fi       * TB_LEN / NF
            y1    = -hl + (fi + 1) * TB_LEN / NF
            y_mid = (y0 + y1) / 2
            seg   = TB_LEN / NF
            z_top = TB_PARA * y_mid ** 2 + TB_Z_MID - TB_TOP_T
            make_box(f'Teqboard_Trim_{label}_{fi}',
                     (sx * (hw + TRIM_T / 2), y_mid, z_top - TRIM_H / 2),
                     TRIM_T, seg, TRIM_H,
                     mat=M_TB_BODY, col=col_table)

    # End-trim at Y = ±hl (the lowest points of the arch)
    for sy in (+1, -1):
        label  = 'N' if sy > 0 else 'S'
        z_end  = TB_Z_EDGE - TB_TOP_T
        make_box(f'Teqboard_Trim_{label}',
                 (0.0, sy * (hl + TRIM_T / 2), z_end - TRIM_H / 2),
                 TB_W + TRIM_T * 2, TRIM_T, TRIM_H,
                 mat=M_TB_BODY, col=col_table)

    # ── 3. Legs — height driven by their Y position on the arch ───────────────
    leg_xs = (+hw * 0.78, -hw * 0.78)
    leg_ys = (+hl * 0.84, -hl * 0.84)
    for i, lx in enumerate(leg_xs):
        for j, ly in enumerate(leg_ys):
            leg_top_z = TB_PARA * ly ** 2 + TB_Z_MID - TB_TOP_T
            make_box(f'Teqboard_Leg_{i}{j}',
                     (lx, ly, leg_top_z / 2),
                     TB_LEG_W, TB_LEG_W, leg_top_z,
                     mat=M_TB_LEG, col=col_table)

    # ── 4. X-shaped base — two diagonal members crossing at centre ────────────
    # Angle: atan2(leg_y, leg_x) so the bars actually connect opposite corners.
    diag_len  = math.sqrt((leg_xs[0] * 2) ** 2 + (leg_ys[0] * 2) ** 2) * 0.92
    brace_ang = math.atan2(leg_ys[0], leg_xs[0])   # ~62° for these proportions
    brace_z   = (TB_PARA * leg_ys[0] ** 2 + TB_Z_MID - TB_TOP_T) * 0.28
    for sign in (+1, -1):
        b = make_box(f'Teqboard_XBase_{"+45" if sign>0 else "-45"}',
                     (0.0, 0.0, brace_z),
                     diag_len, TB_LEG_W * 0.90, TB_LEG_W * 0.90,
                     mat=M_TB_LEG, col=col_table)
        b.rotation_euler[2] = sign * brace_ang

    # ── 5. Net / filet (plexiglass) ───────────────────────────────────────────
    # At Y=0 the surface is at its highest point (TB_Z_MID = 0.76 m).
    # The net runs along X (full width) and stands 14 cm above the surface.
    make_box('Teqboard_Net',
             (0.0, 0.0, TB_Z_MID + TB_NET_H / 2),
             TB_W, TB_NET_T, TB_NET_H,
             mat=M_TB_NET, col=col_table)

# ══════════════════════════════════════════════════════════════════════════════
#  BUILD
# ══════════════════════════════════════════════════════════════════════════════

# Bleachers — 4 sides
build_bank('East_West',   LONG_SPAN,  COURT_HX, axis='X')
build_bank('North_South', SHORT_SPAN, COURT_HY, axis='Y')

# Court floor
build_court()

# Teqball table
build_teqboard()

# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

n_blch  = len(col_bleach.objects)
n_court = len(col_court.objects)
n_table = len(col_table.objects)
print("─" * 60)
print("  Generation complete")
print(f"  Bleachers  : {n_blch} objects  — 4 sides, {N_ROWS} rows each")
print(f"  Court      : {n_court} object   — {COURT_HX*2:.0f} m × {COURT_HY*2:.0f} m blue surface")
print(f"  Teqboard   : {n_table} objects  — curved top (parabola a={TB_PARA:.4f}),")
print(f"               {TB_LEN} m × {TB_W} m, H_centre={TB_Z_MID} m, H_edge={TB_Z_EDGE} m")
print(f"               net {TB_NET_H*100:.0f} cm tall at Y=0 (plexiglass)")
print("─" * 60)
