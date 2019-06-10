import BasePlane from './BasePlane'

export default  class Geosyn3dMap {

  constructor (dom_node, options) {

    if (!options) {
      options = {}
    }
    //default to epsg:28356
    this.basePlane = options.basePlane || new BasePlane(189586.6272, 5812134.5296, 620826.7456, 1785237.0198)
    this.MAX_Z = options.maxZ || 1200000
    this.BASE_Z = options.baseZ || -1000

    this.tilesBuffer = []
    this.currentZoom = -1

    this.terrainTileSize = options.terrainTileSize || 128
    this.imageryTileSize = options.imageryTileSize || 512

    this.seams = {}
    // this.viewer = new Potree.Viewer(typeof dom_node === 'string'? document.getElementById(dom_node) : dom_node)
  }

  initPlane () {
    let geometry = new THREE.PlaneGeometry(this.PLANE_WIDTH, this.PLANE_HEIGHT, 1)
    let material = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true, opacity: 1})
    let plane = new THREE.Mesh(geometry, material)
    plane.geometry.vertices.forEach((v) => {
      v.x = v.x + (this.PLANE_WIDTH / 2) + this.PLANE_MINX
      v.y = v.y + (this.PLANE_HEIGHT / 2) + this.PLANE_MINY
      v.z = this.BASE_Z
    })
    plane.name = 'base_plane'
    this.plane = plane
  }
}