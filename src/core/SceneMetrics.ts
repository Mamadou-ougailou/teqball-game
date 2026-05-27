import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

export interface ISceneMetrics {
  courtMinX: number; courtMaxX: number;
  courtMinZ: number; courtMaxZ: number;
  courtCenterX: number; courtCenterZ: number;
  courtHalfWidth: number;  // X half-extent
  courtHalfLength: number; // Z half-extent
  tableTopY: number;
  tableCenterX: number; tableCenterZ: number;
  tableHalfWidth: number;  // X half-extent of table
  tableHalfLength: number; // Z half-extent of table
  serveLine1Z: number; // player 0 (neg-Z side) serve line Z
  serveLine2Z: number; // player 1 (pos-Z side) serve line Z
  netCenterZ: number;  // Z = 0
  lineY: number;       // Y just above court floor
}

export class SceneMetrics {
  private static _instance: ISceneMetrics | null = null;

  static get(): ISceneMetrics {
    if (!SceneMetrics._instance) throw new Error('SceneMetrics not populated');
    return SceneMetrics._instance;
  }

  /** Call once after bleachers.glb meshes are loaded, passing all the loaded meshes. */
  static populate(allMeshes: AbstractMesh[], serveLine1Z: number, serveLine2Z: number): void {
    // Defaults
    let courtMinX = -6;
    let courtMaxX = 6;
    let courtMinZ = -9;
    let courtMaxZ = 9;
    let lineY = 0.01;

    let tableTopY = 0.76;
    let tableCenterX = 0;
    let tableCenterZ = 0;
    let tableHalfWidth = 0.85;
    let tableHalfLength = 1.5;

    // Find court floor mesh
    const courtFloor = allMeshes.find(m => m.name.toLowerCase().includes('court_floor'));
    if (courtFloor) {
      const bounds = courtFloor.getHierarchyBoundingVectors(true);
      courtMinX = bounds.min.x;
      courtMaxX = bounds.max.x;
      courtMinZ = bounds.min.z;
      courtMaxZ = bounds.max.z;
      lineY = bounds.max.y + 0.004;
    }

    // Find table/teqboard mesh — prefer teqboard_top, then teqboard, then table
    const tableMesh =
      allMeshes.find(m => m.name.toLowerCase().includes('teqboard_top')) ??
      allMeshes.find(m => m.name.toLowerCase().includes('teqboard')) ??
      allMeshes.find(m => m.name.toLowerCase().includes('table'));

    if (tableMesh) {
      const bounds = tableMesh.getHierarchyBoundingVectors(true);
      tableTopY = bounds.max.y;
      tableCenterX = (bounds.min.x + bounds.max.x) * 0.5;
      tableCenterZ = (bounds.min.z + bounds.max.z) * 0.5;
      const sizeX = Math.max(0.001, bounds.max.x - bounds.min.x);
      const sizeZ = Math.max(0.001, bounds.max.z - bounds.min.z);
      tableHalfWidth = Math.min(sizeX, sizeZ) * 0.5;
      tableHalfLength = Math.max(sizeX, sizeZ) * 0.5;
    }

    const courtCenterX = (courtMinX + courtMaxX) * 0.5;
    const courtCenterZ = (courtMinZ + courtMaxZ) * 0.5;
    const courtHalfWidth = Math.max(0.001, (courtMaxX - courtMinX) * 0.5);
    const courtHalfLength = Math.max(0.001, (courtMaxZ - courtMinZ) * 0.5);

    SceneMetrics._instance = {
      courtMinX, courtMaxX,
      courtMinZ, courtMaxZ,
      courtCenterX, courtCenterZ,
      courtHalfWidth, courtHalfLength,
      tableTopY,
      tableCenterX, tableCenterZ,
      tableHalfWidth, tableHalfLength,
      serveLine1Z,
      serveLine2Z,
      netCenterZ: 0,
      lineY,
    };
  }
}
