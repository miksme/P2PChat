import { EventEmitter } from 'eventemitter3'
/**
 * Made to display download progress
 */
export class FileDownloadState extends EventEmitter {
  private stateInterval: any

  private offset = 0
  private objectState = 'Waiting...'
  constructor (private fileSize: number) {
    super()
  }

  cancelDownload () {
    clearInterval(this.stateInterval)
    this.objectState = 'Cancelling...'
    this.emit('cancel')
  }

  startMonitoring () {
    this.stateInterval = setInterval(() => {
      if (this.offset > 0) {
        this.objectState = `Downloading... ${((this.offset / this.fileSize) * 100).toFixed(2)}%`
      }
      this.emit('state', {
        text: this.objectState
      })
    }, 1000)
  }

  setOffset (offset: number) {
    this.offset = offset
  }

  setFinished (success: boolean, dataObj: Blob|undefined) {
    clearInterval(this.stateInterval)
    if (success) {
      this.objectState = 'Finished'
    } else {
      this.objectState = 'Failed'
    }
    this.emit('finished', {
      success: success,
      blob: dataObj,
      text: this.objectState
    })
  }
}
