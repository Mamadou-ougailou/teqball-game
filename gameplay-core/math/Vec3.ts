/**
 * Self-contained 3D vector — the ONLY math primitive the gameplay core needs.
 *
 * In the original project the pure modules imported `Vector3` from
 * `@babylonjs/core/Maths/math.vector`. That single import is what tied the
 * logic to the rendering engine. This class reproduces exactly the surface the
 * gameplay code touches, with ZERO external dependencies, so every module here
 * can be dropped into ANY engine (or run head-less on a server / in tests).
 *
 * It mirrors the Babylon API used in this codebase so copied logic keeps
 * compiling unchanged:
 *   - instance: x/y/z, clone, copyFrom, add, subtract, scale, length,
 *     lengthSquared, normalize, addInPlace, scaleInPlace
 *   - static:   Zero(), Distance(a, b)
 */
export class Vec3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  copyFrom(v: Vec3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  addInPlace(v: Vec3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  subtract(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  scaleInPlace(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /** Returns a NEW unit vector (does not mutate). Returns (0,0,0) if degenerate. */
  normalize(): Vec3 {
    const len = this.length();
    if (len < 1e-9) return new Vec3(0, 0, 0);
    return new Vec3(this.x / len, this.y / len, this.z / len);
  }

  static Zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static Distance(a: Vec3, b: Vec3): number {
    return a.subtract(b).length();
  }
}

/**
 * Drop-in alias so copied gameplay code can keep using the identifier
 * `Vector3` verbatim. Internally it is the engine-agnostic {@link Vec3}.
 */
export { Vec3 as Vector3 };
