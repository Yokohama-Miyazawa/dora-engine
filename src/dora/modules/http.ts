import * as utils from "../libs/utils"
import fetch from "node-fetch"

export const HTTP = function (DORA, config = {}) {
  /*
   *
   *
   */
  function POSTRequest(mode) {
    return function (node, options) {
      const isTemplated = (options || "").indexOf("{{") != -1
      node.on("input", async function (msg) {
        let message = options
        if (isTemplated) {
          message = utils.mustache.render(message, msg)
        }
        var headers = {}
        var body = msg.payload
        if (typeof body === "object") {
          if (mode === "credential") {
            body = {
              ...body,
              ...this.credential(),
            }
          }
          body = JSON.stringify(body)
          headers["Content-Type"] = "application/json"
        } else {
          if (mode === "credential") {
            body = {
              payload: body,
              ...this.credential(),
            }
          } else {
            body = {
              payload: body,
            }
          }
          body = JSON.stringify(body)
          headers["Content-Type"] = "application/json"
        }
        const timeoutMs = "httpTimeout" in msg ? msg.httpTimeout : 3000
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        try {
          let response = await fetch(`${message}`, {
            method: "POST",
            headers,
            body,
            signal: controller.signal,
          })
          if (response.ok) {
            const data = await response.text()
            try {
              msg.payload = JSON.parse(data)
            } catch (err) {
              msg.payload = data
            }
          } else {
            if (msg._httpErrorInterrupt && msg._httpErrorInterrupt.length > 0) {
              msg.httpError = {
                status: response.status,
                statusText: response.statusText,
              }
              node.goto(msg, msg._httpErrorInterrupt)
              return
            } else {
              msg.httpError = {
                status: response.status,
                statusText: response.statusText,
              }
            }
          }
        } catch (err) {
          msg.httpError = {
            code: err.code,
            type: err.type,
            errno: err.errno,
            message: err.message,
          }
          if (msg._httpErrorInterrupt && msg._httpErrorInterrupt.length > 0) {
            node.goto(msg, msg._httpErrorInterrupt)
            return
          }
          if ((err as any).name === "AbortError") {
            console.error("Fetch request timed out")
          }
        } finally {
          clearTimeout(timeoutId)
        }
        node.send(msg)
      })
    }
  }
  DORA.registerType("post", POSTRequest("normal"))
  DORA.registerType("credential.post", POSTRequest("credential"))

  /*
   *
   *
   */
  function GETRequest(mode) {
    return function (node, options) {
      const isTemplated = (options || "").indexOf("{{") != -1
      node.on("input", async function (msg) {
        let message = options
        if (isTemplated) {
          message = utils.mustache.render(message, msg)
        }
        const timeoutMs = "httpTimeout" in msg ? msg.httpTimeout : 3000
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        try {
          let response = await fetch(`${message}`, {
            method: "GET",
            signal: controller.signal,
          })
          if (response.ok) {
            const data = await response.text()
            try {
              msg.payload = JSON.parse(data)
            } catch (err) {
              msg.payload = data
            }
          } else {
            if (msg._httpErrorInterrupt && msg._httpErrorInterrupt.length > 0) {
              msg.httpError = {
                status: response.status,
                statusText: response.statusText,
              }
              node.goto(msg, msg._httpErrorInterrupt)
              return
            } else {
              msg.httpError = {
                status: response.status,
                statusText: response.statusText,
              }
            }
          }
        } catch (err) {
          msg.httpError = {
            code: err.code,
            type: err.type,
            errno: err.errno,
            message: err.message,
          }
          if (msg._httpErrorInterrupt && msg._httpErrorInterrupt.length > 0) {
            node.goto(msg, msg._httpErrorInterrupt)
            return
          }
          if ((err as any).name === "AbortError") {
            console.error("Fetch request timed out")
          }
        } finally {
          clearTimeout(timeoutId)
        }
        node.send(msg)
      })
    }
  }
  DORA.registerType("get", GETRequest("normal"))

  /*
   *
   *
   */
  function HTTPError(node, options) {
    const labels = node.nextLabel(options)
    if (labels.length <= 0) throw new Error("ラベルを指定してください。")
    node.on("input", async function (msg) {
      if (options) {
        msg._httpErrorInterrupt = labels
      } else {
        delete msg._httpErrorInterrupt
      }
      node.next(msg)
    })
  }
  DORA.registerType("error", HTTPError)
}
