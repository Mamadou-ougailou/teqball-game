# Asset Guidelines

All binary assets are tracked by **Git LFS**. Follow these rules to keep the repo healthy.

## File Size Limits

| Asset Type | Max Size | Notes |
|-----------|----------|-------|
| .glb Models | 10 MB | Teqball table, characters, arenas |
| Textures | 1 MB each | Use `.ktx2` compression |
| Audio | 5 MB each | Use `.ogg` at 128-192 kbps |
| Particles JSON | 100 KB | Include emitter config |
| Shaders JSON | 50 KB | NodeMaterial exports |

## Compression Commands

### 3D Models

```bash
# Optimize .glb with Draco compression
gltf-pipeline -i model.glb -o model-optimized.glb --draco.compressionLevel=10

# Bake animations into .glb (no separate files)
# Use Blender: File → Export → glTF 2.0 → NLA Track as Animation
```

**Checklist:**
- ✅ Rig is clean (no unused bones)
- ✅ All animations baked into file
- ✅ Meshes have meaningful names for tagging
- ✅ No double-sided faces (optimize for single-sided)
- ✅ Compressed with Draco

### Textures

```bash
# Convert PNG to compressed KTX2
# Using BabylonJS texture tool:
npm install -g @babylonjs/ktx2-decoder

# Or use NVIDIA Texture Tools
toktx --bcmp output.ktx2 input.png
```

**Guidelines:**
- Base color (diffuse): 2K max (2048×2048)
- Normal maps: 1K (1024×1024)
- Metallic, Roughness: 512×512 or packed channels
- Always use sRGB for colors, Linear for other maps

**Naming Convention:**
- `character_flamingo_baseColor.ktx2`
- `table_surface_normal.ktx2`
- `arena_cloud_roughness.ktx2`

### Audio

```bash
# Encode WAV to OGG at 192 kbps
ffmpeg -i sound.wav -codec:a libvorbis -q:a 6 sound.ogg

# Music: 128 kbps for background
ffmpeg -i music.wav -codec:a libvorbis -q:a 4 music.ogg
```

**Format:** `.ogg` (Theora video codec also uses .ogg; verify audio)

### Node Materials (Shaders)

BabylonJS Node Material Editor:
1. Design shader in NME
2. Export as JSON
3. Save to `assets/shaders/[name].json`

**Keep it simple:** Node count < 50 for performance.

### Particles

BabylonJS Particle Editor:
1. Design effect in-editor
2. Export as JSON
3. Save to `assets/particles/[name].json`

**Max particles per emitter:** 1000 (pool managed by VFXSystem)

## Git LFS Workflow

### Initial Setup

```bash
git lfs install  # Run once
git lfs track '*.glb' '*.ktx2' '*.ogg' '*.hdr'
git add .gitattributes
git commit -m 'chore: setup Git LFS'
```

### Checking Tracked Files

```bash
# See what's tracked by LFS
git lfs track

# Check file sizes
git lfs ls-files

# Migrate existing large files to LFS
git lfs migrate import --include='*.glb' --include='*.ktx2'
```

### Cloning with LFS

```bash
# Install Git LFS client first
brew install git-lfs  # macOS
apt-get install git-lfs  # Linux
choco install git-lfs  # Windows

# Clone normally
git clone https://github.com/yourorg/teqball-game
cd teqball-game

# LFS objects auto-download with clone
npm install
```

## Directory Structure

```
assets/
  models/
    teqball_table.glb          ← Static arena table (Dev B)
    ball.glb                   ← Ball mesh (Dev B)
    characters/
      flamingo.glb             ← Character with rig + anims (Dev B)
      human_athlete.glb
      character3.glb
    arenas/
      cloud_arena.glb          ← Environment (Dev B)
      underground_rave.glb
      space_station.glb

  textures/
    baseColor/
      character_flamingo.ktx2  ← Body texture (Dev B)
      table_surface.ktx2       ← Table wood/plastic (Dev B)
    normal/
      character_flamingo_normal.ktx2
      table_surface_normal.ktx2
    
    raw/                       ← DO NOT COMMIT
      *.psd                    ← Photoshop source layers
      *.png                    ← Uncompressed source

  audio/
    music/
      cloud_arena.ogg          ← Background loop (Dev C)
      underground_rave.ogg
      space_station.ogg
    sfx/
      bounce_table.ogg         ← Sound effects (Dev C)
      kick.ogg
      score.ogg
      power_activate.ogg

  shaders/
    toon_shader.json           ← NodeMaterial exports (Dev B)
    outline_shader.json
    distortion_shader.json

  particles/
    kick_impact.json           ← Particle emitters (Dev B)
    ball_trail.json
    power_burst.json

  env/
    cloud_arena.hdr            ← Environment maps (Dev B)
    underground_rave.hdr
    space_station.hdr
```

## Asset Import Pipeline

1. **Model Creation** (Blender/Maya)
   - Export to `.glb` with animations baked

2. **Compression** (Draco for .glb)
   - Run gltf-pipeline
   - Check file size

3. **Texture Extraction & Compression**
   - Export textures from Blender as `.png`
   - Convert to `.ktx2` with NVIDIA Texture Tools

4. **Audio Encoding**
   - Export WAV from DAW
   - Encode to `.ogg` with ffmpeg

5. **Commit to Git LFS**
   ```bash
   git add assets/models/teqball_table.glb
   git commit -m 'assets: add teqball table model (Draco optimized)'
   git push
   ```

## Quality Checklist

Before committing **any** asset:

- [ ] File size within limits
- [ ] Compression applied (Draco for models, KTX2 for textures)
- [ ] Naming convention followed
- [ ] Placed in correct directory
- [ ] Git LFS tracked (verify with `git lfs ls-files`)
- [ ] No `.png` or `.psd` in main directories (only in `raw/`)
- [ ] PR description mentions asset changes
- [ ] Dev A approved file size/impact

## Common Issues

**"File too large"**
- Check if .png uploaded instead of .ktx2
- Verify Draco compression applied to .glb
- Confirm encoding bitrate for audio

**"Asset not loading in game"**
- Verify Asset Manager path matches file location
- Check texture/model imports in TypeScript
- Enable debug logs: `DEBUG_MODE = true` in constants.ts

**"Git LFS quota exceeded"**
- Check team LFS storage on GitHub Settings
- Check for duplicate assets (same model uploaded twice)
- Optimize large models further

**"Slow clone/pull"**
- Git LFS uses bandwidth per operation
- Clone only what you need: `git clone --filter=blob:none`
- Avoid pulling all branches: `--single-branch`

## Tools List

| Tool | Purpose | Download |
|------|---------|----------|
| Blender | 3D modeling + rigging | blender.org |
| BabylonJS NME | Shader editor | web.babylonjs.com/nme |
| Particle Editor | Particle systems | web.babylonjs.com/particles |
| gltf-pipeline | Draco compression | npm: gltf-pipeline |
| NVIDIA Texture Tools | KTX2 encoding | developer.nvidia.com/gpu-accelerated-texture-compression |
| FFmpeg | Audio encoding | ffmpeg.org |
| Audacity | Audio editing | audacityteam.org |

## Phase-by-Phase Asset Needs

**Phase 1:** teqball_table.glb only (can be placeholder)
**Phase 2:** character_flamingo.glb + animations
**Phase 3:** All character models, first arena
**Phase 4:** Textures, VFX, audio, shaders
**Phase 5:** Optimization pass, texture LODs
