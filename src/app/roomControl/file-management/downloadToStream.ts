import { EventEmitter } from 'eventemitter3'
/**
 * Similar to WritableStreamForImagesAndStuff but removes map entry the moment it is used.
 * Minor flaw - if a chunk was never received by remote client it can never be sent since this object has already deleted it.
 */
export class WritableStreamForTransfer extends EventEmitter {
  uints: Map<number, Uint8Array> = new Map()
  uintCounter = 0
  closed = false

  write (data: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      if (data instanceof Uint8Array && !this.closed) {
        this.uints.set(this.uintCounter, data)
        this.uintCounter++
        resolve()
      } else {
        reject(new Error('Error'))
      }
    })
  }

  close () {
    console.log(`Closed stream... ${this.uints.size} chunks remaining`)
    if (!this.closed) {
      this.closed = true
      this.abort()
    }
  }

  abort () {
    this.uintCounter = 0
    // this.uints = new Map();
  }

  hasChunk (c: number) {
    return this.uints.has(c)
  }

  getChunk (c: number) {
    const a = this.uints.get(c)
    if (a !== undefined) {
      this.uints.delete(c)
    }
    return a
  }
}
