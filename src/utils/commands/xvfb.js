import os from 'os'
import { spawn } from 'child_process'
import kill from 'tree-kill'
import BrowserError from '../error'
import { enableTimers } from '..'

const consola = console // eslint-disable-line no-console

const supportedPlatforms = [
  'linux',
  'freebsd',
  'openbsd'
]

export default class Xvfb {
  static load(browser) {
    Xvfb.isSupported(true)

    browser.hook('start:before', () => Xvfb.start(typeof browser.config.xvfb === 'object' ? browser.config.xvfb : {}))
    browser.hook('close:after', Xvfb.stop)
  }

  static isSupported(failWhenNot) {
    const platform = os.platform()
    const supported = supportedPlatforms.includes(platform)

    if (!supported && failWhenNot) {
      throw new BrowserError(`Xvfb is not supported on ${platform} platforms`)
    }

    return supported
  }

  static isRunning() {
    return !!Xvfb.process && Xvfb.process.connected
  }

  static start({ displayNum = 99, args = [] } = {}) {
    Xvfb.isSupported(true)
    Xvfb.closed = false

    if (Xvfb.isRunning()) {
      return
    }

    args = (Array.isArray(args) && args) || []

    const display = `:${displayNum}`
    args.unshift(display)
    args.unshift('Xvfb')

    Xvfb.process = spawn('command', args, {
      shell: true,
      stdio: [
        'ignore',
        'ignore',
        'pipe'
      ]
    })

    // set DISPLAY env
    process.env.DISPLAY = display

    let stderr = ''
    Xvfb.process.stderr.on('data', data => (stderr += `${data}`))

    Xvfb.process.on('error', (err) => {
      Xvfb.closed = true

      if (err && err.code === 'ENOENT') {
        throw new BrowserError(`Xvfb not found, please make sure Xvfb is installed`)
      }
    })

    Xvfb.process.on('close', (code, signal) => {
      Xvfb.closed = true

      if (code === 1) {
        const error = stderr.match(/\(EE\) (?!\(EE\))(.+?)$/m)[1] || stderr
        throw new BrowserError(`Failed to start Xvfb${error ? ', ' : ''}${error}`)
      }
    })
  }

  static stop() {
    if (!Xvfb.process || Xvfb.closed) {
      return
    }

    kill(Xvfb.process.pid)

    // enable timers if they where faked by a test framework
    enableTimers()

    const waitTimeout = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        consola.warn(`Timeout: Xvfb did not exit after 3s`)
        resolve()
      }, 3000)
      timeout.unref()
    })

    const waitClosed = new Promise((resolve) => {
      if (Xvfb.closed) {
        resolve()
      }

      const closeInterval = setInterval(() => {
        if (Xvfb.closed) {
          clearInterval(closeInterval)
          resolve()
        }
      }, 50)
    })

    return Promise.race([waitClosed, waitTimeout])
  }
}