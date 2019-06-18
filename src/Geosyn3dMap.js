//https://dwtkns.com/srtm30m/
//http://gis-lab.info/qa/srtm.html
//https://earthexplorer.usgs.gov/

import BasePlane from './BasePlane'
import mergeImages from 'merge-images'
import getPixels from 'get-pixels'

import {findAzimuth, fromID, toID, dist, getBaseLog} from './utils'
import map from 'async/map'
import parallel from 'async/parallel'

export default  class Geosyn3dMap {

  constructor (dom_node, options) {

    if (!options) {
      options = {}
    }
    //default to epsg:28356
    this.basePlane = options.basePlane || new BasePlane(189586.6272, 5812134.5296, 620826.7456, 1785237.0198)
    this.MAX_Z = options.maxZ || 1200000
    this.BASE_Z = options.baseZ || -1000

    this.terrainOptions = options.terrainOptions
    this.imageryOptions = options.imageryOptions

    this.drawTerrain = !!this.imageryOptions

    this.tilesBuffer = []
    this.wmsLayers = []
    this.currentZoom = -1

    this.terrainTileSize = options.terrainTileSize || 128
    this.imageryTileSize = options.imageryTileSize || 512

    this.seams = {}
    // this.viewer = new Potree.Viewer(typeof dom_node === 'string'? document.getElementById(dom_node) : dom_node)
    this.node = typeof dom_node === 'string'? document.getElementById(dom_node) : dom_node


    this.textureContainer = {}
    this.tilePlaceholders = {}
    this.pendingTiles = []
    this.loadingTiles = {}

    this.initRenderer()

    this.initPlane()
  }

  initRenderer () {

    this.viewer = new Potree.Viewer(this.node)
    this.viewer.setEDLEnabled(false)

    this.viewer.setFOV(60)
    this.viewer.setPointBudget(10 * 1000 * 1000)
    this.viewer.scene.view.yaw = 0
    this.viewer.scene.view.pitch = -Math.PI/4

    // this.viewer.setNavigationMode(Potree.EarthControls)
    this.viewer.setNavigationMode(Potree.OrbitControls)

  }

  initPlane () {
    let geometry = new THREE.PlaneGeometry(this.basePlane.planeWidth, this.basePlane.planeHeight, 1)
    let material = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true, opacity: 1})
    let plane = new THREE.Mesh(geometry, material)
    plane.geometry.vertices.forEach((v) => {
      v.x = v.x + (this.basePlane.planeWidth / 2) + this.basePlane.minX
      v.y = v.y + (this.basePlane.planeHeight / 2) + this.basePlane.minY
      v.z = this.BASE_Z
    })
    plane.name = 'base_plane'
    this.plane = plane

    this.viewer.scene.scene.add(plane)
    this.viewer.scene.planeBase = plane

    this.registerWorkers()
    this.calcSeams()


    this.viewer.orbitControls.addEventListener('end', (e) => {
      if (e.action === 'scroll') {
        let zoom = Math.floor(this.getZoom())
        if (zoom !== this.currentZoom) {
          this.currentZoom = zoom
          this.updateTiles()
        }
      } else {
        this.updateTiles()
      }


      this.updateCompass()
      // console.log(this.getCurrentFrustum())
    })

    this.viewer.orbitControls.addEventListener('mousewheel', (e) => {
      let zoom = Math.floor(this.getZoom())
      if (zoom !== this.currentZoom) {
        this.currentZoom = zoom
        this.updateTiles()
      }


      this.updateCompass()
      // console.log(this.getCurrentFrustum())
    })

    /*setTimeout(() => {
      this.updateTiles()
      // this.updateCompass()

    }, 4000)*/

    this.updateTiles()

  }

  zoomToCoords(coords, factor, size) {
    let geometry = new THREE.SphereGeometry( size, 32, 32 )
    geometry.translate(coords[0], coords[1], 500)
    let material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
    let sphere = new THREE.Mesh( geometry, material );
    this.viewer.zoomTo(sphere, factor)
  }

  getCentralPoint () {
    let raycaster = new THREE.Raycaster()
    let camera = this.viewer.scene.getActiveCamera()
    raycaster.set(camera.getWorldPosition(), camera.getWorldDirection())
    let o = raycaster.intersectObject(this.plane)[0]
    if (!o) {
      return null
    } else {
      return o.point
    }
  }

  updateCompass () {
    let pos = this.getCentralPoint()

    if (pos) {
      let camera = this.viewer.scene.getActiveCamera()
      //PotreeService.findAzimuth(pos, camera.position)
      //[camera.position.x, camera.position.y].join(',')
      //can be emmited etc.
    }
  }

  registerWorkers () {
    this.poolSize = 4
    this.workerPool = []
    for (let i = 0; i < this.poolSize; i++) {
      let worker = new Worker('/workers/terrainparser.js')
      this.workerPool.push(worker)

      worker.addEventListener('message', (e) => {

        e = e.data
        let terrainData = e[0]
        let tileSize = e[1]
        let t = e[2]
        let tileType = e[3]
        let s = this.terrainTileSize

        let texture = this.textureContainer[t.id]

        if (!texture) {
          return
        }

        this.viewer.scene.scene.remove(this.viewer.scene.scene.getObjectByName(t.id + 'p'))
        let index = this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(t.id)
        if (index === -1) {
          return
        }

        this.resolveSeams(terrainData, t, tileType)

        /*let url = '/api/gs-lidar/wms?VERSION=1.1.1&FORMAT=image/png&REQUEST=GetMap&SRS=EPSG:28356&WIDTH=512&HEIGHT=512&TRANSPARENT=true' +
          '&BBOX=' + ([t.x, t.y, t.x + tileSize, t.y + tileSize].join(',')) + '&LAYERS=grp_imagery&tiled=true'

        // url = '/static/empty_tile.png'
        let texture = new THREE.TextureLoader()
          .load(url)*/

        let material = this.createMaterial(texture, tileType)
        this.loadAllCoverage(texture, tileType)

        let geometry = new THREE.PlaneBufferGeometry(tileSize, tileSize, s - 1, s - 1)
        geometry.addAttribute('position', new THREE.BufferAttribute(terrainData, 3))
        let plane = new THREE.Mesh(geometry, material)
        plane.name = tileType === 'terrain' ? (t.id + 't') : (t.id + 's')

        this.viewer.scene.scene.children.forEach(c => {
          if (c.name === plane.name) {
            this.viewer.scene.scene.remove(c)
          }
          /*if (c.name && (c.name[c.name.length-1] === 's' || c.name[c.name.length-1] === 't')) {
            let id = parseInt(c.name.slice(0, c.name.length-1))
            if (!isNaN(id) && (this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(id) === -1)) {
              this.viewer.scene.scene.remove(c)
            }
          }*/
        })

        this.viewer.scene.scene.add(plane)

      })

    }
  }


  calcSeams () {
    let totalCount = Math.pow(this.terrainTileSize, 2) * 3
    let rowCount = this.terrainTileSize * 3
    //above, left, below, right
    this.seams['neighborTiles'] = [[0, 1, 0], [-1, 0, 0], [0, -1, 0], [1, 0, 0]]
    this.seams['row'] = [[], [], [], []]
    this.seams['rowZ'] = [[], [], [], []]

    for (let c = 0; c < rowCount; c += 3) {
      //top, left, bottom, right
      this.seams['row'][0].push(c + 1)
      this.seams['row'][1].push(c / 3 * (rowCount))
      this.seams['row'][2].push(c + 1 + totalCount - rowCount)
      this.seams['row'][3].push((c / 3 + 1) * (rowCount) - 3)

      this.seams['rowZ'][0].push(c + 2)
      this.seams['rowZ'][1].push(c / 3 * (rowCount) + 2)
      this.seams['rowZ'][2].push(c + 2 + totalCount - rowCount)
      this.seams['rowZ'][3].push((c / 3 + 1) * (rowCount) - 1)
    }
  }

  resolveSeams (data, t, tileType) {
    this.seams['neighborTiles'].forEach((nt, index) => {
      let [x, y, z] = fromID(t.id)
      x += nt[0]
      y += nt[1]

      let id = toID(x, y, z)

      let name = tileType === 'terrain' ? (id + 't') : (id + 's')
      let neighbour = this.viewer.scene.scene.getObjectByName(name)
      if (neighbour) {
        let neighbourIndex = (index + 2) % 4
        // indices that need to be overwritten
        let indicesToChange = this.seams['row'][index]
        //indices of neighbor vertices to copy
        let neighborIndices = this.seams['row'][neighbourIndex]
        let neighborVertices = neighbour.geometry.attributes.position.array

        let z = this.seams['rowZ'][index]
        let zn = this.seams['rowZ'][neighbourIndex]

        for (let a = 0; a < 128; a++) {
          data[indicesToChange[a]] = neighborVertices[neighborIndices[a]]
          data[z[a]] = neighborVertices[zn[a]]
        }
      }
    })

    return data
  }


  createMaterial (tContainer, tileType) {
    /*if (!tContainer.imageryTexture) {
      return new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: false, opacity: 1, transparent: false})
    }*/
    /*if (tileType === 'terrain') {
      return new THREE.MeshBasicMaterial({map: tContainer.imageryTexture, opacity: 0.65, transparent: true})
    } else {
      let texture = new THREE.TextureLoader()
        .load('/static/empty_tile.png')
      // return new THREE.MeshBasicMaterial({map: texture, opacity: 0.65, transparent: true})
      return new THREE.MeshBasicMaterial({map: texture})
      // return new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: false, opacity: 0, transparent: true})
    }*/

    // return new THREE.MeshBasicMaterial({map: tContainer.imageryTexture, opacity: 0.65, transparent: true})

    return new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: true, opacity: 1, transparent: true})
    /*let texture =  new THREE.TextureLoader()
        .load('/static/empty_tile.png')
    return new THREE.MeshBasicMaterial({map: texture})*/

  }

  loadAllCoverage (tContainer, tileType) {

    let urls = tContainer.urls.concat(this.getWmsCoverages(tContainer.t, tileType))
    let meshId = tContainer.t.id + 't'
    if (tileType === 'subsurface') {
      urls = this.getWmsCoverages(tContainer.t, tileType)
      meshId = tContainer.t.id + 's'
    }

    mergeImages(urls).then(b64 => {
      let texture = new THREE.TextureLoader()
        .load(b64, () => {
          let mesh = this.viewer.scene.scene.getObjectByName(meshId)

          if (mesh) {
            mesh.material.map = texture
            mesh.material.needsUpdate = true
          }
        })

    })
  }

  getWmsCoverages (t, tileType) {
    return this.wmsLayers.filter(l => l.enabled).filter(l => l.tileType === tileType).map(layer => {
      return `${layer.geoserverUrl}wms?VERSION=1.1.1&FORMAT=image/png&REQUEST=GetMap&SRS=${layer.srs}&WIDTH=${this.imageryTileSize}&HEIGHT=${this.imageryTileSize}&TRANSPARENT=true&BBOX=${[t.x, t.y, t.x + t.tileSize, t.y + t.tileSize].join(',')}&LAYERS=${layer.layerName}${layer.cql ? '&cql_filter=' + layer.cql : ''}`
    })
  }


  clearPlaceholders () {
    Object.keys(this.tilePlaceholders).forEach(k => {
      this.viewer.scene.scene.remove(this.viewer.scene.scene.getObjectByName(k + 'p'))
    })

    this.tilePlaceholder = {}
  }

  updateTiles () {
    let cp = this.getCentralPoint()
    if (!cp) {
      console.log('no objects under ray')
      return
    }

    let zoom = Math.floor(this.getZoom())
    // console.log('zoom: ' + zoom)
    // console.log('z: ' + (this.viewer.scene.getActiveCamera().position.z))
    if (zoom >= 18) {
      return
    }

    let tileSize = this.basePlane.planeWidth / Math.pow(2, zoom)
    console.log('tile size: ' + tileSize)
    if (isNaN(tileSize)) {
      return
    }

    let tiles = this.findTiles(cp, tileSize, zoom, 6)

    this.clearPlaceholders()
    tiles.forEach((t) => {
      t.tileSize = tileSize
      this.makeTilePlaceholder(t, tileSize)
    })

    let visibleTiles = this.getVisiblePlaceholders()
    tiles = tiles.filter(t => visibleTiles.indexOf(t.id) > -1)
    // this.clearPlaceholders()

    console.log(tiles.length)

    let newTiles = []
    let oldTiles = []

    tiles.forEach((t) => {
      let index = this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(t.id)
      if (index === -1) {
        newTiles.push(t)
      }
      /*else {
             if (!this.viewer.scene.scene.getObjectByName(t.id + 's')  && !this.loadingTiles[t.id]) {
               this.tilesBuffer.splice(index, 1)
               newTiles.push(t)
             }
           }*/
    })

    this.tilesBuffer.forEach((t) => {
      let index = tiles.map(function (tt) {return tt.id}).indexOf(t.id)
      if (index === -1) {
        oldTiles.push(t)
      }
    })

    oldTiles.forEach((t) => {
      this.viewer.scene.scene.remove(this.viewer.scene.scene.getObjectByName(t.id + 't'))
      this.viewer.scene.scene.remove(this.viewer.scene.scene.getObjectByName(t.id + 's'))
      delete this.textureContainer[t.id]
      let index = this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(t.id)
      this.tilesBuffer.splice(index, 1)
    })

    // console.log(`new: ${newTiles.length}`)
    // console.log(`old: ${oldTiles.length}`)

    let i = 0
    this.pendingTiles = []
    newTiles.forEach((t) => {
      this.tilesBuffer.push(t)
      let worker = this.workerPool[i++]
      if (i > (this.poolSize - 1)) {
        i = 0
      }
      this.pendingTiles.push({
        tile: t,
        worker: worker
      })

    })

    let uniMap = {}

    this.pendingTiles.forEach(p => {
      uniMap[p.tile.id] = p
    })

    this.pendingTiles = []
    Object.keys(uniMap).forEach(k => {
      this.pendingTiles.push(uniMap[k])
    })

    this.loadTiles(0, 2)

    this.clearLostTrash()
  }

  getVisiblePlaceholders () {
    let frustum = this.getCurrentFrustum()
    return Object.keys(this.tilePlaceholders).filter(k => {
      return frustum.intersectsObject(this.tilePlaceholders[k])
    }).map(tid => parseInt(tid))
  }

  getCurrentFrustum () {
    let frustum = new THREE.Frustum()
    let camera = this.viewer.scene.getActiveCamera()
    frustum.setFromMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))

    return frustum
  }

  pointToTile (p, tileSize, zoom) {
    if (p.x < this.basePlane.minX || p.y < this.basePlane.minY || p.x > (this.basePlane.planeWidth + this.basePlane.minX) || p.y > (this.basePlane.minY + this.basePlane.planeHeight)) {
      return null
    }

    let xc = Math.floor((p.x - this.basePlane.minX) / tileSize)
    let yc = Math.floor((p.y - this.basePlane.minY) / tileSize)

    //lower left angle
    let x = xc * tileSize + this.basePlane.minX
    let y = yc * tileSize + this.basePlane.minY

    // console.log(`ts: ${tileSize}, x: ${x}, y: ${y}`)
    // console.log(`xc: ${xc}, yc: ${yc}`)
    return {
      x: x,
      y: y,
      z: 0,
      id: toID(xc, yc, zoom)
    }
  }

  findTiles (p, tileSize, zoom, pad) {
    // let centralTile = pointToTile(p, tileSize, zoom)
    let tiles = []
    let stride = tileSize * pad
    let x = p.x - (stride / 2)
    let y = p.y - (stride / 2)
    let startY = y
    let maxX = x + stride
    let maxY = y + stride

    while (x < Math.floor(maxX)) {
      while (y < Math.floor(maxY)) {
        tiles.push(this.pointToTile({x: x, y: y}, tileSize, zoom))
        y += tileSize
      }
      x += tileSize
      y = startY
    }

    tiles = tiles.filter((t) => {
      return !!t
    })

    return tiles.sort((a, b) => {
      return dist(a, p) - dist(b, p)
    })
  }


  getDistanceToBasePlane () {
    let pos = this.getCentralPoint()
    if (!pos) {
      return null
    }
    let camera = this.viewer.scene.getActiveCamera()
    return camera.position.distanceTo(pos)
  }

  getZoom () {
    // let pt = this.viewer.scene.getActiveCamera().position.z
    let pt = this.getDistanceToBasePlane()
    return Math.max(
      getBaseLog(0.5, pt === null ? this.MAX_Z : pt / this.MAX_Z),
      0
    )
  }

  makeTilePlaceholder (t, tileSize) {
    let c = [
      t.x, t.y + tileSize, this.BASE_Z,
      t.x + tileSize / 2, t.y + tileSize, this.BASE_Z,
      t.x + tileSize, t.y + tileSize, this.BASE_Z,

      t.x, t.y + tileSize / 2, this.BASE_Z,
      t.x + tileSize / 2, t.y + tileSize / 2, this.BASE_Z,
      t.x + tileSize, t.y + tileSize / 2, this.BASE_Z,

      t.x, t.y, this.BASE_Z,
      t.x + tileSize / 2, t.y, this.BASE_Z,
      t.x + tileSize, t.y, this.BASE_Z

    ]
    let geometry = new THREE.PlaneBufferGeometry(tileSize, tileSize, 2, 2)
    geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(c), 3))
    // let texture = new THREE.TextureLoader()
    //   .load('/static/empty_tile.png')
    // let plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({map: texture}))
    let plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: false,
      opacity: 0,
      transparent: true
    }))

    plane.name = t.id + 'p'
    this.tilePlaceholders[t.id] = plane
    this.viewer.scene.scene.add(plane)
  }


  loadTiles (index, step) {
    let tiles = this.pendingTiles.slice(index, index + step)
    if (!tiles.length) {
      return
    }
    map(tiles, (b, c) => {
      this.tile2mesh(b.tile, b.worker, c)
    }, () => {
      this.loadTiles(index + step, step * 2)
    })
  }


  clearLostTrash () {
    this.viewer.scene.scene.children.forEach(c => {
      let name = c.name
      if (name) {
        let n = name
        if (name[name.length - 1] === 's' || name[name.length - 1] === 't') {
          n = name.substr(0, name.length - 1)
        }
        n = parseInt(n)
        if (isNaN(n)) {
          return
        }
        let index = this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(n)
        if (index === -1) {
          this.viewer.scene.scene.remove(c)
        }
      }
    })
  }

  tile2mesh (t, worker, clb) {
    let tileSize = t.tileSize
    let index = this.tilesBuffer.map(function (tt) {return tt.id}).indexOf(t.id)
    if (index === -1) {
      return
    }
    let url = `${this.terrainOptions.geoserverUrl.replace(/\/$/, "")}/wms?VERSION=1.1.1&FORMAT=application/bil32&REQUEST=GetMap&SRS=${this.terrainOptions.srs}&WIDTH=128&HEIGHT=128&BBOX=${([t.x, t.y, t.x + tileSize, t.y + tileSize].join(','))}&LAYERS=${this.terrainOptions.layerName}&tiled=true`

    let tUrl = `${this.imageryOptions.geoserverUrl.replace(/\/$/, "")}/wms?VERSION=1.1.1&FORMAT=image/png&REQUEST=GetMap&SRS=${this.terrainOptions.srs}&WIDTH=512&HEIGHT=512&TRANSPARENT=true&BBOX=${([t.x, t.y, t.x + tileSize, t.y + tileSize].join(','))}&LAYERS=${this.imageryOptions.layerName}&tiled=true`

    // url = '/static/empty_tile.png'
    this.loadingTiles[t.id] = t
    parallel([
      (clb) => {
        this.textureContainer[t.id] = {
          imageryTexture: null,
          urls: [],
          t: t
        }
        let imageryTexture = new THREE.TextureLoader()
            .load(tUrl, (err, resp) => {
              clb(null)
            })
        this.textureContainer[t.id] = {
          imageryTexture: imageryTexture,
          urls: [tUrl],
          t: t
        }
        this.textureContainer[t.id].imageryTexture = imageryTexture
        this.textureContainer[t.id].urls.push(tUrl)

      },
      (clb) => {
        if (this.drawTerrain) {
          /*getPixels(url, (err, pixels) => {
            clb(null, pixels)
          })*/
          let oReq = new XMLHttpRequest();
          oReq.open("GET", url, true);
          oReq.responseType = "arraybuffer";
          oReq.onload = function (oEvent) {
            var arrayBuffer = oReq.response;

            if (arrayBuffer) {
              clb(null, arrayBuffer)
            } else {
              clb(null)
            }
          }

          oReq.onerroe = function() {
            clb(null)
          }

          oReq.send(null);

        } else {
          clb(null)
        }

      }/*,
      (clb) => {
        getPixels(coalUrl, (err, pixels) => {
          clb(null, pixels)
        })
      }*/
    ], (err, res) => {

      if (!err) {
        if (res[1]) {
          worker.postMessage([res[1], t, tileSize, this.terrainTileSize, 'raw'])
        }

        /*if (this.drawSubsurface) {
          worker.postMessage([null, t, tileSize, this.terrainTileSize, 'subsurface'])
        }*/

      } else {
        console.error('could not load tile')
      }
      delete this.loadingTiles[t.id]
      clb(null)
    })

    // console.log('GET TEST')
    // getPixels('http://local.vd.com:8888/api/gs-lidar/wms?VERSION=1.1.1&FORMAT=image/png&REQUEST=GetMap&SRS=EPSG:28356&WIDTH=128&HEIGHT=128&TRANSPARENT=true&BBOX=276890.3883,7014986.3492,286590.8062,7024686.7671&LAYERS=wksp_arrow:sb_dem&t=kjhhjhjk',
    //   (err, pixels) => {
    //   console.log(pixels.data[0])
    //   console.log(pixels.data[1])
    //   console.log(pixels.data[2])
    //
    //   console.log(pixels.data[65536-384])
    //   console.log(pixels.data[65536-383])
    //   console.log(pixels.data[65536-382])
    //   })

  }

  /**
   *
   * @param options
   * required params:
   *  geoserverUrl (eg. /api/gs)
   *  layerName (eg. public.terrain_layer)
   *  srs (eg. EPSG:28356)
   *
   */

  setTerrainOptions (options) {
    if (!this.validateRequiredWmsOptions(options)) {
      console.error('Terrain layer not set. Check options.')
      return
    }
    this.terrainOptions = options
  }

  setImageryOptions (options) {
    if (!this.validateRequiredWmsOptions(options)) {
      console.error('Imagery layer not set. Check options.')
      return
    }
    this.imageryOptions = options
  }

  addWmsLayer (options) {
    if (!this.validateRequiredWmsOptions(options)) {
      console.error('WMS layer not added. Check options.')
      return
    }
    this.wmsLayers.push(options)
  }

  removeWmsLayer(name) {
    let index = this.wmsLayers.map(_ => _.name).indexOf(name)
    if (index > -1) {
      this.wmsLayers.splice(index, 1)
    }
  }

  validateRequiredWmsOptions (options) {
    let valid = true
    if (!options.layerName) {
      console.error('Error: layerName not provided')
      valid = false
    }

    if (!options.geoserverUrl) {
      console.error('Error: geoserverUrl not provided')
      valid = false
    }

    if (!options.srs) {
      console.error('Error: srs not provided')
      valid = false
    }
  }


}