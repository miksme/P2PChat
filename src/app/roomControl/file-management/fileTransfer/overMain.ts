import { PeerRoles, UploaderHandles, DownloaderHandles } from './withMultiple'
import { FileData } from '../../../helpers/fileData'
import { Logger } from '../../../helpers/logMsg'
import EventEmitter from 'eventemitter3'
import { WorkerComm } from '../fileHelpers'

import { WritableStreamForImagesAndStuff } from '../downloadToDisplay'
import { FileDownloadState } from '../fileDownloadState'
import { WritableStreamForTransfer } from '../downloadToStream'
/**
 * Transfers files "over the main" connection (the same one that sends msgs and signals)
 */
export class FileTransferOverMain extends EventEmitter {
  private role: PeerRoles
  private chunkSize: number = 16 * 1024
  private stateMonitor: FileDownloadState|undefined
  private fileStream: WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff|WritableStreamForTransfer|undefined
  private file: File|undefined
  private stateInterval: NodeJS.Timer|undefined
  private isWritable: (()=>boolean)|undefined
  private fileReader: FileReader|undefined
  constructor (private fileData: FileData, handles:DownloaderHandles|UploaderHandles) {
    super()
    if (handles instanceof DownloaderHandles) {
      this.role = PeerRoles.download
      this.stateMonitor = handles.stateMonitor
      this.fileStream = handles.fileStream
      this.initDownloadCycle()
    } else {
      this.role = PeerRoles.upload
      if (handles.file instanceof File) {
        this.file = handles.file
      } else {
        this.file = undefined
        this.fileStream = handles.file
      }
      this.isWritable = handles.isWritable
      this.initUploadCycle()
    }
    setTimeout(() => {
      this.transferStateCheck()
    }, 1000)
  }

  private transferStateCheckNum = 0
  private lastTransferState = 0
  private transferSpecState = -1
  private transferStateCheck () {
    if (!this.isClosing) {
      if (this.lastTransferState === this.nextChunk) {
        this.transferStateCheckNum++
      } else if (this.nextChunk > this.lastTransferState) {
        this.transferStateCheckNum = 0
        this.lastTransferState = this.nextChunk
        this.transferSpecState = -1
      }
      if (this.role === PeerRoles.download) {
        if (this.transferStateCheckNum > 6 && this.transferSpecState !== this.nextChunk) {
          this.LogMsg('[Transfer monitor] requesting chunks')
          if ((this.fileData.FileSize / this.chunkSize) < this.nextChunk + 10) {
            for (let i = this.nextChunk; i < (this.fileData.FileSize / this.chunkSize); i++) {
              this.sendReqChunk(i)
            }
          } else {
            this.sendReqChunk(this.nextChunk)
          }
          this.transferSpecState = this.nextChunk
        } else if (this.transferStateCheckNum > 20) {
          // Assumes that something has gone very wrong
          this.LogMsg('[Transfer monitor] terminating')
          this.sendReqChunk(-1)
          this.terminate()
        }
      } else {
        if (this.transferStateCheckNum > 20) {
          // Assumes that the connection is dead
          this.LogMsg('[Transfer monitor] terminating')
          this.terminate()
        }
      }
      setTimeout(() => {
        this.transferStateCheck()
      }, 500)
    }
  }

  private chunkMap: Map<number, Uint8Array> = new Map()
  private nextChunk = 0
  private isReading = false
  private isClosing = false
  private emitChunk (ChunkID: number, Chunk:Uint8Array) { // Only uploader calls
    this.emit(WorkerComm.signal, { ChunkID: ChunkID, Chunk: Chunk })
  }

  public addChunk (ChunkID: number, Chunk:Uint8Array) {
    this.chunkMap.set(ChunkID, Chunk)
    this.writeNextChunk()
  }

  // Problem: will never finish if some of the last chunks never arrive
  private writeNextChunk () {
    if (!this.isReading) {
      this.isReading = true
      let a = this.chunkMap.get(this.nextChunk)
      if (a) {
        this.chunkMap.delete(this.nextChunk)
        if (((this.nextChunk * this.chunkSize) + a.byteLength) - this.fileData.FileSize === 1) {
          a = a.slice(0, a.byteLength - 1)
        }
        this.fileStream?.write(a)
        this.nextChunk++
        if ((this.nextChunk * this.chunkSize) >= this.fileData.FileSize) {
          this.LogMsg('File written')
          this.finish(true)
        } else if (this.chunkMap.size > 0) {
          setImmediate(() => { this.writeNextChunk() })
        }
      } else {
        if (this.chunkMap.size > 32) {
          this.LogMsg('Too many unused chunks...')
          this.terminate()
        } else if (this.chunkMap.size > 8) {
          this.sendReqChunk(this.nextChunk)
        }
      }
      this.isReading = false
    }
  }

  private initDownloadCycle () {
    this.stateInterval = setInterval(() => { this.stateMonitor?.setOffset(this.chunkSize * this.nextChunk) }, 1000)
    this.stateMonitor?.on('cancel', () => { this.LogMsg('User canceled'); this.terminate() })
    this.stateMonitor?.startMonitoring()
  }

  private initUploadCycle () {
    if (this.file) {
      this.LogMsg('Reading from file')
      this.uploadF()
    } else if (this.fileStream instanceof WritableStreamForImagesAndStuff) {
      this.LogMsg('Reading from filestream')
      this.uploadWs()
    }
  }

  private readNextChunk = true
  private uploadF () {
    this.fileReader = new FileReader()
    this.fileReader.onload = (e) => {
      const objt = <ArrayBuffer>e.target?.result
      if (objt) {
        const obj = new Uint8Array(objt)
        this.chunkMap.set(this.nextChunk, obj)
        this.nextChunk++
        this.fUploadSend()
        this.fUploadReadNextChunk()
      }
    }
    setImmediate(() => { this.fUploadReadNextChunk() })
    // setTimeout(() => {
    //  this.fUploadReadNextChunk();
    // }, 1000); //Side-effect of delaying the start of transmission for the ackR to reach downloader
  }

  private uploadWs () {
    if (this.fileStream instanceof WritableStreamForImagesAndStuff || this.fileStream instanceof WritableStreamForTransfer) {
      this.fileStream.on('newdata', () => {
        this.wsUploadSend()
      })
      setImmediate(() => { this.wsUploadSend() })
      // setTimeout(() => {
      //  this.wsUploadSend();
      // }, 1000); //Side-effect of delaying the start of transmission for the ackR to reach downloader
    }
  }

  private wsUploadSend () {
    if (this.isWritable) {
      if (!this.isWritable()) {
        setTimeout(() => {
          this.wsUploadSend()
        }, 100)
      } else {
        if (this.fileStream instanceof WritableStreamForImagesAndStuff || this.fileStream instanceof WritableStreamForTransfer) {
          const uint = this.fileStream.getChunk(this.nextChunk)
          if (uint) {
            this.emitChunk(this.nextChunk, uint)
            this.nextChunk++
            if (this.fileStream.hasChunk(this.nextChunk)) {
              setImmediate(() => { this.wsUploadSend() })
            }
          } else {
            setTimeout(() => {
              this.wsUploadSend()
            }, 1000)
          }
        }
      }
    }
  }

  private fUploadReadNextChunk () {
    if (this.readNextChunk) {
      if (this.chunkMap.size < 32 && this.file) {
        if (this.nextChunk * this.chunkSize > this.fileData.FileSize) {
          this.LogMsg('File uploaded')
          this.uploadFinish()
          // this.finish(true);
        } else {
          this.fileReader?.readAsArrayBuffer(this.file.slice(this.nextChunk * this.chunkSize, (this.nextChunk + 1) * this.chunkSize))
        }
      } else {
        setTimeout(() => {
          this.fUploadReadNextChunk()
        }, 1000)
      }
    }
  }

  private fUploadSend () {
    if (this.isWritable) {
      if (!this.isWritable()) {
        setTimeout(() => {
          this.fUploadSend()
        }, 100)
      } else {
        const uint = this.chunkMap.get(this.nextChunk)
        if (uint) {
          this.emitChunk(this.nextChunk, uint)
          this.chunkMap.delete(this.nextChunk)
          this.nextChunk++
          if (this.chunkMap.has(this.nextChunk)) {
            setImmediate(() => { this.fUploadSend() })
          }
        }
      }
    }
  }

  private readChunk (chunkID: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (this.file !== undefined) {
        this.file.slice(chunkID * this.chunkSize, (chunkID + 1) * this.chunkSize).arrayBuffer().then((a) => {
          resolve(new Uint8Array(a))
        }).catch(e => {
          reject(e)
        })
      } else if (this.fileStream instanceof WritableStreamForImagesAndStuff || this.fileStream instanceof WritableStreamForTransfer) {
        const a = this.fileStream.getChunk(chunkID)
        if (a !== undefined) {
          resolve(a)
        } else {
          reject(new Error('Chunk is not accessible'))
        }
      } else { reject(new Error('Nowhere to read from')) }
    })
  }

  private sendReqChunk (ChunkID: number) { // Only downloader calls
    this.emit(WorkerComm.signal, ChunkID)
  }

  public recvReqChunk (ChunkID: number) {
    if (ChunkID === -1) { // If received ID is -1, assumes downloader has finished and closes
      if (this.uploadReadyForFinish) {
        this.finish(true)
      } else {
        this.terminate()
      }
    } else {
      this.readChunk(ChunkID).then(c => {
        this.emitChunk(ChunkID, c)
      })
    }
  }

  private uploadReadyForFinish = true
  private uploadFinish () {
    this.uploadReadyForFinish = true
  }

  private finish (success: boolean) {
    if (!this.isClosing) {
      this.LogMsg(`Finishing... success:${success}`)
      this.isClosing = true
      this.fileStream?.close()
      let blob: Blob|undefined
      if (this.fileStream instanceof WritableStreamForImagesAndStuff && success) {
        blob = this.fileStream.get()
      }
      this.destroyObjts()
      this.stateMonitor?.setFinished(success, blob)
      this.emit(WorkerComm.finished, { success: success })
    }
  }

  private terminate () {
    if (!this.isClosing) {
      this.LogMsg('Terminating...')
      this.isClosing = true
      this.fileStream?.abort()
      this.destroyObjts()
      this.stateMonitor?.setFinished(false, undefined)
      this.emit(WorkerComm.finished, { success: false })
    }
  }

  private destroyObjts () {
    this.chunkMap = new Map()
    this.readNextChunk = false
    this.fileStream = undefined
    this.file = undefined
    this.fileReader?.abort()
    this.fileReader = undefined
    if (this.stateInterval) { clearInterval(this.stateInterval) }
  }

  public cancel () {
    this.LogMsg('Mgr called cancel')
    this.terminate()
  }

  private LogMsg (msg: string, loglevel = 3) {
    Logger.Msg('Download OverMain', msg, loglevel)
  }
}
