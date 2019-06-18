self.addEventListener('message', function (e) {
  e = e.data

  var t = e[1]
  var tileSize = e[2]
  var s = e[3]


  if (e[4] === 'rgb') {
      var pixels = e[0]
    parseRgbAsTerrain(pixels, t, tileSize, s, e[4])

  } else if (e[4] === 'raw') {
      var arrayBuffer = e[0]
      parseRaw(arrayBuffer, t, tileSize, s, e[4])
  } else {
      console.log('ERROR: unknown parse mode. Currently supported rgb or raw')
  }

})

var domain = [235, 447]
var range = [1000, 2500]
function exagarrate(v) {
  return (((v - domain[0]) / (domain[1] - domain[0])) * range[1]) + range[0]
}

function parseRgbAsTerrain(pixels, t, tileSize, si, tt) {
    var s = si
    var pixelSize = tileSize / s

    var ulx = t.x
    var uly = t.y + tileSize
    var counter = 0
    var xi = 0
    var yj = 0

    var lowest = 0
    var highest = 10000
    var temp
    var j, r, g, b = 0

    var c = []

    for (var i = 0; i < pixels.data.length; i += 4) {
        yj = Math.floor(counter / s)
        xi = counter - (yj * s)
        counter++

        r = pixels.data[i]
        g = pixels.data[i + 1]
        b = pixels.data[i + 2]

        temp = (r << 16) + (g << 8) + b

        var x = ulx + (xi * pixelSize)
        var y = uly - (yj * pixelSize)

        c.push(x)
        j += 4
        c.push(y)
        j += 4

        c.push(!isSubsurface ? temp : temp > 1000 ? -(temp - 1000) : temp)

        /*if (temp > lowest && temp < highest) {
          c.push(!isSubsurface ? temp : temp > 1000 ? -(temp - 1000) : temp)
          // c.push(temp)
        } else {
          c.push(0)
        }*/

        j += 4

    }
    let terrainData = new Float32Array(c)
    self.postMessage(
        [terrainData, tileSize, t, e[4]]
    )
}

var flag = 0
function parseCoalDepth (t, tileSize, si, tt) {
  var s = si
  var pixelSize = tileSize / s

  var url = '/api/gs-lidar/wms?VERSION=1.1.1&FORMAT=application/bil16&REQUEST=GetMap&SRS=EPSG:28356&WIDTH='+s+'&HEIGHT='+s+'&TRANSPARENT=true'+
    '&BBOX='+([t.x, t.y, t.x + tileSize, t.y + tileSize].join(','))+'&LAYERS=wksp_arrow:coaldepth_south_absolute_int16_56'
  // console.log(url)
  var oReq = new XMLHttpRequest();
  oReq.open("GET", url, true);
  oReq.responseType = "arraybuffer";

  oReq.onload = function (oEvent) {
    var arrayBuffer = oReq.response;
    if (arrayBuffer) {
      var viewerIn = new DataView(arrayBuffer)
      var littleEndianBuffer = new ArrayBuffer(s * s * 12)
      var viewerOut = new DataView(littleEndianBuffer)

      var ulx = t.x
      var uly = t.y + tileSize
      var counter = 0
      var xi = 0
      var yj = 0
      var lower = -500


      var temp

      var j = 0
      for (var i = 0; i < viewerIn.byteLength; i += 2) {

        yj = Math.floor(counter / s)
        xi = counter - (yj * s)
        counter++

        var x = ulx + (xi * pixelSize)
        var y = uly - (yj * pixelSize)
        viewerOut.setFloat32(j, x, true)
        j += 4
        viewerOut.setFloat32(j, y, true)
        j += 4

        temp = viewerIn.getInt16(i, true)
        if (temp < lower) {
          temp = lower
        }
        // if (flag++ < 100) {
        //   console.log(temp)
        // }
        viewerOut.setFloat32(j, temp, true)

        j += 4
      }

      let terrainData = new Float32Array(littleEndianBuffer)
      self.postMessage(
        [terrainData, tileSize, t, tt]
      )
    }

  };

  oReq.send(null);
}


function parseRaw (arrayBuffer, t, tileSize, s, tt) {
    var pixelSize = tileSize / s


    if (arrayBuffer) {
        var viewerIn = new DataView(arrayBuffer)
        var littleEndianBuffer = new ArrayBuffer(s * s * 12)
        var viewerOut = new DataView(littleEndianBuffer)

        var ulx = t.x
        var uly = t.y + tileSize
        var counter = 0
        var xi = 0
        var yj = 0

        var lowest = 0
        var highest = 5000
        var temp
        var goodCell = 0
        var somme = 0
        var j = 0
        for (var i = 0; i < viewerIn.byteLength; i += 4) {

            yj = Math.floor(counter / s)
            xi = counter - (yj * s)
            counter++

            var x = ulx + (xi * pixelSize)
            var y = uly - (yj * pixelSize)
            viewerOut.setFloat32(j, x, true)
            j += 4
            viewerOut.setFloat32(j, y, true)
            j += 4

            temp = viewerIn.getFloat32(i, true)
            if (temp > lowest && temp < highest) {
                viewerOut.setFloat32(j, temp, true)
                somme += temp
                goodCell++
            } else {
                var val = somme / (goodCell || 1)
                viewerOut.setFloat32(j, val, true)
            }


            j += 4
        }

        let terrainData = new Float32Array(littleEndianBuffer)
        self.postMessage(
            [terrainData, tileSize, t, tt]
        )
    }
}
/*self.addEventListener('message', function (e) {
  e = e.data
  var t = e[0]
  var tileSize = e[1]
  var si = e[2]

  var s = si
  var pixelSize = tileSize / s

  var url = '/api/gs-lidar/wms?VERSION=1.1.1&FORMAT=application/bil32&REQUEST=GetMap&SRS=EPSG:28356&WIDTH='+s+'&HEIGHT='+s+'&TRANSPARENT=true'+
  '&BBOX='+([t.x, t.y, t.x + tileSize, t.y + tileSize].join(','))+'&LAYERS=wksp_arrow:sb_dem'
  // console.log(url)
  var oReq = new XMLHttpRequest();
  oReq.open("GET", url, true);
  oReq.responseType = "arraybuffer";

  oReq.onload = function (oEvent) {
    var arrayBuffer = oReq.response;
    if (arrayBuffer) {
      var viewerIn = new DataView(arrayBuffer)
      var littleEndianBuffer = new ArrayBuffer(s * s * 12)
      var viewerOut = new DataView(littleEndianBuffer)

      var ulx = t.x
      var uly = t.y + tileSize
      var counter = 0
      var xi = 0
      var yj = 0

      var lowest = 0
      var highest = 5000
      var temp
      var goodCell = 0
      var somme = 0
      var j = 0
      for (var i = 0; i < viewerIn.byteLength; i += 4) {

        yj = Math.floor(counter / s)
        xi = counter - (yj * s)
        counter++

        var x = ulx + (xi * pixelSize)
        var y = uly - (yj * pixelSize)
        viewerOut.setFloat32(j, x, true)
        j += 4
        viewerOut.setFloat32(j, y, true)
        j += 4

        temp = viewerIn.getFloat32(i, true)
        if (temp > lowest && temp < highest) {
          viewerOut.setFloat32(j, temp, true)
          somme += temp
          goodCell++
        } else {
          var val = somme / (goodCell || 1)
          viewerOut.setFloat32(j, val, true)
        }


        j += 4
      }

      let terrainData = new Float32Array(littleEndianBuffer)
      self.postMessage(
        [terrainData, tileSize, t]
      )
    }

  };

  oReq.send(null);

})*/

