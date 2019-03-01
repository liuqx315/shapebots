import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import actions from '../redux/actions'
import _ from 'lodash'
import munkres from 'munkres-js'
import 'babel-polyfill'

const socket = new WebSocket('ws://localhost:8080/ws');

import Robot from './Robot'
import Point from './Point'

class App extends Component {
  constructor(props) {
    super(props)
    window.app = this
    this.socket = socket
    this.state = {
      robots: [],
      ids: [],
      corners: [],
      points: []
    }
    this.socket.onmessage = this.onMessage.bind(this)

    this.width = 1920
    this.height = 1080

    this.ips = {
      0: '192.168.27.138',
      1: '192.168.27.172',
      2: '192.168.27.170',
    }
    this.port = 8883

  }

  componentDidMount() {
    // this.frameId = requestAnimationFrame(this.animate)
  }

  onMessage(e) {
    let data = JSON.parse(e.data)
    this.updateCamera(data.image)
    this.updateRobots(data.ids, data.corners)
  }

  updateRobots(ids, corners) {
    let robots = []
    let i = 0
    for (let id of ids) {
      let robot = {}
      robot.id = id[0]
      let points = corners[i][0]
      let x = _.sum(points.map((point) => {
        return point[0]
      })) / 4
      let y = _.sum(points.map((point) => {
        return point[1]
      })) / 4
      // robot.points = points
      robot.pos = { x: this.width - x, y: y}

      let a1 = Math.atan2(points[0][0] - points[2][0], points[0][1] - points[2][1]) * 180 / Math.PI
      // let a2 = Math.atan2(points[1][0] - points[3][0], points[1][1] - points[3][1]) * 180 / Math.PI
      let angle = (a1 + 360 + 135) % 360
      robot.angle = angle
      robot.ip = this.ips[robot.id]
      robots.push(robot)
      i++
    }
    this.setState({ robots: robots })
  }

  updateCamera(src) {
    const canvas = document.getElementById('canvas')
    const context = canvas.getContext('2d')
    const image = new Image()
    image.src = 'data:image/png;base64,' + src
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
  }

  sendCommand(ip, command) {
  }

  onClick(event) {
    if (!this.count) this.count = 0
    let x = event.clientX
    let y = event.clientY

    let max = this.state.robots.length
    let i = this.count % max
    let point = { x: x * 2, y: y * 2 }
    let points = this.state.points
    points[i] = point
    this.setState({ points: points })
    this.count++
  }

  start() {
    let res = this.assign()
    let distMatrix = res.distMatrix
    let rids = res.rids
    let ids = munkres(distMatrix)
    for (let id of ids) {
      let pid = id[0]
      let rid = rids[id[1]]
      let point = this.state.points[pid]
      console.log('rid: ' + rid, 'pid: ' + pid)
      // this.move(rid, point)
    }
  }

  assign() {
    let distMatrix = []
    let rids = []
    for (let point of this.state.points) {
      let distArray = []
      for (let robot of this.state.robots) {
        let dist = Math.sqrt((point.x - robot.pos.x)**2 + (point.y - robot.pos.y)**2)
        distArray.push(dist)
        rids.push(robot.id)
      }
      distMatrix.push(distArray)
    }
    if (!distMatrix.length) return
    return { distMatrix: distMatrix, rids: rids }
  }

  async move(id, point) {
    // forward: a2, b1, right: a2, left: b1
    let error = 0
    while (true) {
      try {
        let res = this.calculate(id, point)
        if (res.dist < 100) break
        console.log(res)
        let a2 = Math.min(255, parseInt(res.dist))
        let b1 = Math.min(255, parseInt(res.dist))
        if (res.diff < 0) { // left
          console.log('left')
          a2 = Math.max(a2 - parseInt(Math.abs(res.diff))*3, 0)
        } else { // right
          console.log('right')
          b1 = Math.max(b1 - parseInt(Math.abs(res.diff))*3, 0)
        }
        let command = { a1: 0, a2: a2, b1: b1, b2: 0 }
        console.log(command)
        let message = { command: command, ip: this.ips[id], port: this.port }
        this.socket.send(JSON.stringify(message))
        await this.sleep(100)
      } catch (err) {
        console.log('lost AR marker')
        error++
        if (error > 30) break
      }
    }
    console.log('finish')
    this.stop(id)
  }

  stop(id) {
    let command = { a1: 0, a2: 0, b1: 0, b2: 0 }
    let message = { command: command, ip: this.ips[id], port: this.port }
    this.socket.send(JSON.stringify(message))
  }

  async sleep(time) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, time)
    })
  }

  calculate(id, point) {
    let robot = this.getRobot(id)
    let dir = Math.atan2(point.x - robot.pos.x, point.y - robot.pos.y) * 180 / Math.PI
    dir = (-dir + 180) % 360
    let diff = dir - robot.angle
    let dist = Math.sqrt((point.x - robot.pos.x)**2 + (point.y - robot.pos.y)**2)
    return { diff: diff, dist: dist }
  }

  getRobot(id) {
    for (let robot of this.state.robots) {
      if (robot.id === id) return robot
    }
    return null
  }

  animate() {
    this.frameId = window.requestAnimationFrame(this.animate)
  }

  updateState(state) {
    this.props.store.dispatch(actions.updateState(state))
  }

  render() {
    return (
      <div>
        <div className="ui grid">
          <div className="twelve wide column">
            <canvas id="canvas" width={ this.width / 2 } height={ this.height / 2 }></canvas>
            <svg id="svg" width={ this.width / 2 } height={ this.height / 2 } onClick={ this.onClick.bind(this) }>
              { this.state.robots.map((robot, i) => {
                return (
                  <Robot
                    id={robot.id}
                    key={robot.id}
                    x={robot.pos.x}
                    y={robot.pos.y}
                    angle={robot.angle}
                  />
                )
              })}

              { this.state.points.map((point, i) => {
                return (
                  <Point
                    id={i}
                    key={i}
                    x={point.x}
                    y={point.y}
                  />
                )
              })}
            </svg>
          </div>
          <div className="four wide column">
            <div className="ui teal button" onClick={ this.start.bind(this) }>
              Move
            </div>
            <br/>
            <br/>
            <div>
              Robots
              <pre id="robots">{ JSON.stringify(this.state.robots, null, 2) }</pre>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

window.addEventListener('resize', () => {
  // window.app.resize()
}, false)

function mapStateToProps(state) {
  return state
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(actions, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(App)



/*
  async moveOld(id, point) {
    while (true) {
      while (true) {
        let finish = await this.rotate(id, point)
        if (finish) {
          console.log('rotate finish')
          break
        }
      }
      let finish = await this.forward(id, point)
      if (finish) {
        console.log('forward finish')
        break
      }
    }
    console.log('finish')
  }

  rotate(id, point) {
    let robot = this.state.robots[0] // id
    let angle = Math.atan2(point.x - robot.pos.x, point.y - robot.pos.y) * 180 / Math.PI
    angle = (-angle + 180) % 360
    let diff = angle - robot.angle
    let left = { a1: 255, a2: 0, b1: 255, b2: 0 }
    let right = { a1: 0, a2: 255, b1: 0, b2: 255 }
    let command
    if (diff < 0) {
      command = left
      console.log('left')
    } else {
      command = right
      console.log('right')
    }
    let duration = parseInt(Math.abs(diff))
    if (duration > 100) {
      command.duration = 100
    } else {
      command.duration = duration
    }
    command.duration = 20
    let message = { command: command, ip: this.ips[id], port: this.port }
    if (duration < 30) {
      return true
    } else {
      this.socket.send(JSON.stringify(message))
      return new Promise((resolve, reject) => {
        setTimeout(resolve, command.duration * 2)
      })
    }
    // return { duration: duration, message: message }
  }

  forward(id, point) {
    let robot = this.state.robots[0] // id
    let dist = Math.sqrt((point.x - robot.pos.x)**2 + (point.y - robot.pos.y)**2)
    let forward = { a1: 0, a2: 255, b1: 255, b2: 0 }
    let duration = parseInt(dist)
    let command = forward
    command.duration = parseInt(dist)
    // command.duration = 100
    let message = { command: command, ip: this.ips[id], port: this.port }
    if (duration < 100) {
      return true
    } else {
      this.socket.send(JSON.stringify(message))
      return new Promise((resolve, reject) => {
        setTimeout(resolve, command.duration * 2)
      })
    }
    // return { duration: duration, message: message }
  }

  async testSleep() {
    for (let i = 0; i < 10; i++) {
      console.log(i)
      let res = await this.test(i)
      if (res) {
        console.log('break')
        break
      }
    }
    console.log('end')
  }

  test(i) {
    if (i > 5) {
      return true
    } else {
      return new Promise((resolve, reject) => {
        setTimeout(resolve, 1000)
      })
    }
  }

  // stop() {
  //   cancelAnimationFrame(this.frameId)
  // }
*/
