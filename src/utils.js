export function findAzimuth (pt1, pt2) {
  let dX = pt2.x - pt1.x
  let dY = pt2.y - pt1.y
  let dist = Math.sqrt((dX * dX) + (dY * dY))
  let dXa = Math.abs(dX)
  let beta = (Math.acos(dXa / dist) * 180) / Math.PI

  let angle = 0

  if (dX > 0) {
    if (dY < 0) {
      angle = 270 + beta
    } else {
      angle = 270 - beta
    }
  } else {
    if (dY < 0) {
      angle = 90 - beta
    } else {
      angle = 90 + beta
    }
  }

  return angle
}

export function dist (a, b) {
  return Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
}

export function toID (x, y, z) {
  let dim = 2 * (1 << z)
  return ((dim * y + x) * 32) + z
}

export function fromID (id) {
  var z = id % 32,
    dim = 2 * (1 << z),
    xy = ((id - z) / 32),
    x = xy % dim,
    y = ((xy - x) / dim) % dim
  return [x, y, z]
}

export function getBaseLog (base, result) {
  return Math.log(result) / Math.log(base)
}
