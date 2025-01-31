import BrowserError from '../utils/error'
import Webpage from '../webpage'

export default class JsdomWebpage extends Webpage {
  async wrapWithGlobals(fn) {
    global.window = this.window
    global.document = this.document

    const ret = await fn()

    delete global.window
    delete global.document

    return ret
  }

  async open(url, readyCondition = 'body') {
    const jsdomOpts = this.browser.config.jsdom || {}

    const options = {
      resources: 'usable',
      runScripts: 'dangerously',
      virtualConsole: false,
      pretendToBeVisual: true,
      beforeParse(window) {
        // Mock window.scrollTo
        window.scrollTo = () => {}

        if (typeof jsdomOpts.beforeParse === 'function') {
          jsdomOpts.beforeParse(window)
        }
      },
      ...jsdomOpts
    }

    const onJsdomError = (err) => {
      throw new BrowserError(this, err)
    }

    if (options.virtualConsole === 'trues') {
      const logLevels = this.browser.logLevels

      const pageConsole = new Proxy({}, {
        get(target, type) {
          if (logLevels.includes(type)) {
            return console[type] // eslint-disable-line no-console
          }

          return _ => _
        }
      })

      const virtualConsole = new this.driver.VirtualConsole()
      virtualConsole.on('jsdomError', onJsdomError)
      virtualConsole.sendTo(pageConsole)

      options.virtualConsole = virtualConsole
    } else {
      delete options.virtualConsole
    }

    if (url.startsWith('file://')) {
      this.page = await this.driver.JSDOM.fromFile(url.substr(7), options)
    } else {
      this.page = await this.driver.JSDOM.fromURL(url, options)
    }

    await this.browser.callHook('page:created', this.page)

    this.browser.hook('close:before', () => {
      if (options.virtualConsole) {
        options.virtualConsole.removeListener('jsdomError', onJsdomError)
      }

      this.page.window.close()
    })

    this.window = this.page.window
    this.document = this.page.window.document

    if (readyCondition) {
      const t = this
      await new Promise((resolve, reject) => {
        let iter = 1

        async function waitForElement() {
          let isReady

          if (typeof readyCondition === 'function') {
            isReady = await t.wrapWithGlobals(readyCondition)
          } else {
            isReady = !!t.document.querySelector(readyCondition)
          }

          if (isReady) {
            resolve()
            return
          }

          if (iter > 100) {
            reject(new BrowserError(t, `Timeout reached on waiting for readyCondition: ${readyCondition}`))
            return
          }

          setTimeout(waitForElement, 100)
          iter++
        }

        waitForElement()
      })
    }

    return this.returnProxy()
  }

  runScript(fn, ...args) {
    return this.wrapWithGlobals(() => fn(...args))
  }

  runAsyncScript(fn, ...args) {
    return this.wrapWithGlobals(() => fn(...args))
  }

  getHtml() {
    return this.document.documentElement.outerHTML
  }

  getTitle() {
    return this.document.title
  }

  getElementFromPage(pageFunction, selector, ...args) {
    const el = this.document.querySelector(selector)
    if (!el) {
      return Promise.resolve(null)
    }

    return Promise.resolve(pageFunction(el, ...args))
  }

  getElementsFromPage(pageFunction, selector, ...args) {
    const els = Array.from(this.document.querySelectorAll(selector))
    return Promise.resolve(pageFunction(els, ...args))
  }
}
