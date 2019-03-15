import path from 'path'
import Hookable from './utils/hookable'
import BrowserError from './utils/error'
import Xvfb from './utils/commands/xvfb'
import { abstractGuard, loadDependency, getBrowserConfigFromString, getBrowserImportFromConfig } from './utils'

export default class Browser extends Hookable {
  constructor(config = {}) {
    super()

    abstractGuard('Browser', new.target)

    if (config.xvfb !== false) {
      if (config.browserConfig.window) {
        if (typeof config.xvfb !== 'object') {
          config.xvfb = { args: [] }
        }

        config.xvfb.args.push(`-screen 0 ${config.browserConfig.window.width}x${config.browserConfig.window.height}x24`)
      } else if (!config.xvfb) {
        config.xvfb = true
      }

      Xvfb.load(this)
    }

    this.config = config
    this.ready = false

    if (config.extendPage && typeof config.extendPage === 'function') {
      this.hook('page:after', async (page) => {
        const extendWith = await config.extendPage(page)
        if (extendWith && typeof extendWith === 'object') {
          page.extend(extendWith)
        }
      })
    }

    this.capabilities = {}

    if (this.config.browserConfig) {
      for (const key in this.config.browserConfig) {
        if (key.startsWith('provider')) {
          continue
        }

        const fn = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`
        if (this[fn]) {
          this[fn](this.config.browserConfig[key])
        } else {
          console.warn(`browserConfig '${key}' could not be set`) // eslint-disable-line no-console
        }
      }
    }
  }

  static async get(browserString, config = {}) {
    const browserConfig = getBrowserConfigFromString(browserString)
    const browserImport = getBrowserImportFromConfig(browserConfig)

    try {
      // add browserConfig to config
      config.browserConfig = browserConfig

      const Browser = await import(path.resolve(__dirname, ...browserImport)).then(m => m.default || m)

      const browserInstance = new Browser(config)
      await browserInstance.loadDependencies()
      return browserInstance
    } catch (e) {
      if (e instanceof BrowserError) {
        throw e
      } else {
        throw new BrowserError(`Error occured while loading '${browserConfig.browser || browserString}' browser`, e)
      }
    }
  }

  setLogLevel(level) {}

  async loadDependency(dependency) {
    try {
      return await loadDependency(dependency)
    } catch (e) {
      throw new BrowserError(this, e.message)
    }
  }

  _loadDependencies() {}

  async loadDependencies(...args) {
    await this.callHook('dependencies:load')

    await this._loadDependencies(...args)

    await this.callHook('dependencies:loaded')
  }

  getCapabilities(capabilities) {
    if (!capabilities) {
      return this.capabilities
    }

    return {
      ...this.capabilities,
      ...capabilities
    }
  }

  addCapability(key, value) {
    this.capabilities[key] = value
    return this
  }

  addCapabilities(capabilities) {
    this.capabilities = {
      ...this.capabilities,
      ...capabilities
    }
    return this
  }

  setWindow(width, height) {
    if (!height && typeof width === 'object') {
      this.config.window = width
      return this
    }

    this.config.window = { width, height }
    return this
  }

  setBrowser(name, version = '') {
    this.addCapability('browserName', name)

    if (version) {
      this.setBrowserVersion(version)
    }

    return this
  }

  setBrowserVersion() { return this }

  setOs(...args) { return this.setOS(...args) }

  setOsVersion(...args) { return this.setOSVersion(...args) }

  setOS() { return this }

  setOSVersion() { return this }

  setDevice() { return this }

  isReady() {
    return this.ready
  }

  async start(capabilities, ...args) {
    await this.callHook('start:before')

    try {
      await this._start(capabilities, ...args)

      await this.callHook('start:after', this.driver)

      this.ready = true

      return this
    } catch (e) {
      await this.close()

      throw new BrowserError(e)
    }
  }

  async close(...args) {
    await this.callHook('close:before')

    await this._close(...args)

    await this.callHook('close:after')
  }

  async page(...args) {
    await this.callHook('page:before')

    const page = await this._page(...args)

    await this.callHook('page:after', page)

    return page
  }
}