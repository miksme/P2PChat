import { EventEmitter } from 'eventemitter3'
/**
 * Blob collection that pretends to be a DefaultWriter
 */
export class WritableStreamForImagesAndStuff extends EventEmitter {
  uints: Array<Uint8Array> = []
  blob: Blob|undefined
  closed = false
  constructor (private theoreticalMIME:string) {
    super()
  }

  write (data: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      if (data instanceof Uint8Array) {
        this.uints.push(data)
        this.emit('newdata', this.uints.length - 1)
        resolve()
      } else {
        reject(new Error('Not an Uint8Array'))
      }
    })
  }

  close () {
    if (!this.closed) {
      this.blob = new Blob(this.uints, { type: this.theoreticalMIME })
      this.closed = true
      this.abort()
    }
  }

  abort () {
    this.uints = []
  }

  get () {
    if (!this.closed) {
      this.close()
    }
    return this.blob
  }

  hasChunk (c: number) {
    if (c >= 0 && c < this.uints.length) {
      return true
    }
    return false
  }

  getChunk (c: number) {
    if (c >= 0 && c < this.uints.length) {
      return this.uints[c]
    }
    return undefined
  }
}
