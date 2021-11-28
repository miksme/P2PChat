import { FileData } from '../../../helpers/fileData'
import { Logger } from '../../../helpers/logMsg'
import EventEmitter from 'eventemitter3'
import { WorkerComm, InternalWorkerComm } from '../fileHelpers'
import Peer from 'simple-peer'

import { JSONparse } from '../../../helpers/JSONparse'
import { WritableStreamForImagesAndStuff } from '../downloadToDisplay'
import { FileDownloadState } from '../fileDownloadState'
import { UserConfig } from '../../../config/config'
import { WritableStreamForTransfer } from '../downloadToStream'

export enum PeerRoles {
    download,
    upload
}
export class DownloaderHandles {
  fileStream: WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff|WritableStreamForTransfer
  stateMonitor:FileDownloadState|undefined
  constructor (fileStream: WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff|WritableStreamForTransfer, stateMonitor:FileDownloadState|undefined = undefined) {
    this.stateMonitor = stateMonitor
    this.fileStream = fileStream
  }
}
export class UploaderHandles {
  file: File|WritableStreamForImagesAndStuff|WritableStreamForTransfer
  isWritable: (()=>boolean)|undefined
  constructor (file: File|WritableStreamForImagesAndStuff|WritableStreamForTransfer, isWritable: (()=>boolean)|undefined = undefined) {
    this.file = file
    this.isWritable = isWritable
  }
}
class PeerSignalDecode {
  public static decode (data: any):{type: InternalWorkerComm, data: any} {
    return JSONparse.destringify(data)
  }

  public static chunkData (data:any):{chunkSize: number, fileData: FileData, role:PeerRoles} {
    return data
  }

  public static suggestPeerAmount (data: any):number {
    return data
  }

  public static requestChunk (data: any):number {
    return data
  }

  public static respondChunk (data: any):{chunkID: number, chunk: Uint8Array} {
    return data
  }

  public static signal (data: any):{peerID: number, signal: any} {
    return data
  }

  public static terminateTransfer (data: any):{errored:boolean} {
    return data
  }

  public static testWrite (data:any):string {
    return data
  }
}
class PeerSignalEncode {
  private static encode (type: InternalWorkerComm, data: any) {
    return JSONparse.stringify({ type: type, data: data })
  }

  public static chunkData (chunkSize: number, fileData: FileData, role:PeerRoles) {
    return this.encode(InternalWorkerComm.chunkData, { chunkSize: chunkSize, fileData: fileData, role: role })
  }

  public static suggestPeerAmount (num: number) {
    return this.encode(InternalWorkerComm.suggestPeerAmount, num)
  }

  public static requestChunk (chunkID: number) {
    return this.encode(InternalWorkerComm.requestChunk, chunkID)
  }

  public static respondChunk (chunkID: number, chunk: Uint8Array) {
    return this.encode(InternalWorkerComm.respondChunk, { chunkID: chunkID, chunk: chunk })
  }

  public static signal (peerID: number, signal: any) {
    return this.encode(InternalWorkerComm.signal, { peerID: peerID, signal: signal })
  }

  public static startTransfer () {
    return this.encode(InternalWorkerComm.startTransfer, {})
  }

  public static terminateTransfer (errored: boolean) {
    return this.encode(InternalWorkerComm.terminateTransfer, { errored: errored })
  }

  public static pauseTransfer () {
    return this.encode(InternalWorkerComm.bufferOverPause, {})
  }

  public static resumeTransfer () {
    return this.encode(InternalWorkerComm.Resume, {})
  }

  public static testWrite () {
    return this.encode(InternalWorkerComm.respondPeerAmount, 'test msg')
  }
}
/*
    ORDER:
    (source) ChunkData ->
    (target) SuggestPeerAmount ->
    (source) SuggestPeerAmount ->
    (target) SuggestPeerAmount ->
    (source) SuggestPeerAmount ->

    (source) Signal -> (*)
    (target) Signal -> (*)

    (source) StartTransfer
*/
/**
 * Creates a seperate "Mgr" along with other peers to transfer a file.
 * Due to the amount of time required to set this up its usually a lot faster to just use FileTransferOverMain
 */
export class PeerFileTransfer extends EventEmitter {
  private mgrPeer:Peer.Instance
  private setToClose = false
  private closing = false
  private isInTesting = false
  private isReadyForSlavePeerComm = false
  private isActive = false

  private role: PeerRoles
  private highWaterMark: number = 128 * 1024
  private chunkSize: number = 16 * 1024
  private file: File|undefined

  private selectedPeerAmount: number = this.maxNumPeers
  private selectedPeerAmountConfirmed = false
  private selectedPeerFailed = -1

  private fileStream: WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff|WritableStreamForTransfer|undefined
  private stateMonitor:FileDownloadState|undefined
  constructor (private maxNumPeers:number, private isInitial: boolean, private fileData: FileData, handles:DownloaderHandles|UploaderHandles) {
    super()
    if (this.maxNumPeers <= 0) {
      this.maxNumPeers = 1
      // this.selectedPeerAmount=0;
    }
    this.selectedPeerAmount = this.maxNumPeers
    // this.initMgrPeer();
    if (handles instanceof DownloaderHandles) {
      this.role = PeerRoles.download
      this.fileStream = handles.fileStream
      this.stateMonitor = handles.stateMonitor
      if (this.stateMonitor) {
        this.downloaderStateInterval = setInterval(() => {
          this.stateMonitor?.setOffset(this.downloadedBytes)
        }, 1000)
        this.stateMonitor?.on('cancel', () => {
          this.terminate()
        })
      }
    } else {
      this.role = PeerRoles.upload
      if (handles.file instanceof File) {
        this.file = handles.file
      } else {
        this.file = undefined
        this.fileStream = handles.file
      }
    }

    this.mgrPeer = new Peer({ initiator: this.isInitial, trickle: true, config: UserConfig.getPeerConfig() })
    this.mgrPeerSignals()
  }

  private transferStateCheckNum = 0
  private lastTransferState = 0
  private transferSpecState = -1
  private transferStateCheck () {
    if (!this.closing) {
      let chunkID = this.activeChunk
      if (this.role === PeerRoles.upload) {
        chunkID = this.nextChunk
      }
      if (this.lastTransferState === chunkID) {
        this.transferStateCheckNum++
      } else if (chunkID > this.lastTransferState) {
        this.transferStateCheckNum = 0
        this.lastTransferState = chunkID
        this.transferSpecState = -1
      }
      if (this.role === PeerRoles.download) {
        if (this.transferStateCheckNum > 24 && this.transferSpecState !== chunkID) {
          this.LogMsg('[Transfer monitor] requesting chunks')
          if ((this.fileData.FileSize / this.chunkSize) < chunkID + 10) {
            for (let i = chunkID; i < (this.fileData.FileSize / this.chunkSize); i++) {
              this.requestChunk(i)
            }
          } else {
            this.requestChunk(chunkID)
          }
          this.transferSpecState = chunkID
        } else if (this.transferStateCheckNum > 80) {
          // Assumes that something has gone very wrong
          this.LogMsg('[Transfer monitor] terminating')
          this.terminate()
        }
      } else {
        if (this.transferStateCheckNum > 80) {
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

  private initMgrPeer () {
    this.mgrPeer = new Peer({ initiator: this.isInitial, trickle: true, config: UserConfig.getPeerConfig() })
    this.mgrPeerSignals()
  }

  signal (signal: any) {
    this.mgrPeer.signal(signal)
  }

  private mgrPeerSignals () {
    this.mgrPeer.on('signal', (data) => {
      this.emit(WorkerComm.signal, data)
    })
    this.mgrPeer.on('error', err => {
      this.LogMsg('Mgr got an error: ' + err)
    })
    this.mgrPeer.on('close', () => {
      this.LogMsg('Mgr was closed')
      if (!this.setToClose) {
        /* setTimeout(() => {
                this.LogMsg("Restarting...");
                this.initMgrPeer();
              }, this.isInitial?1000:1); */
        this.LogMsg('Will not restart...')
      } this.terminate()
    })
    this.mgrPeer.on('connect', () => {
      this.LogMsg('Mgr connection established')
      this.mgrPeer.write(PeerSignalEncode.testWrite())
    })
    this.mgrPeer.on('data', (c) => {
      const recvData = PeerSignalDecode.decode(c)
      switch (recvData.type) {
        case InternalWorkerComm.respondPeerAmount:
          {
            const msg = PeerSignalDecode.testWrite(recvData.data)
            this.LogMsg(`Got a message: ${msg}`)
            if (this.role === PeerRoles.download) {
              this.mgrPeer.write(PeerSignalEncode.chunkData(this.chunkSize, this.fileData, PeerRoles.upload))
            }
          }
          break
        case InternalWorkerComm.suggestPeerAmount:
          if (!this.isReadyForSlavePeerComm) {
            let num = PeerSignalDecode.suggestPeerAmount(recvData.data)
            if (num === this.selectedPeerAmount) {
              this.mgrPeer.write(PeerSignalEncode.suggestPeerAmount(num))
              if (!this.selectedPeerAmountConfirmed) {
                this.selectedPeerAmountConfirmed = true
              } else {
                // Both agree, proceeding
                this.LogMsg(`Peer amount matched (${this.selectedPeerAmount}), proceeding`)
                this.selectedPeerFailed = 4// Already confirmed, change leads to termination
                this.isReadyForSlavePeerComm = true
                this.createSlavePeers()
              }
            } else {
              this.selectedPeerFailed++
              if (this.selectedPeerFailed > 3) {
                if (this.isInTesting) {
                  this.LogMsg('[ERROR] could not match peers, proceeding')
                  this.selectedPeerAmount = num
                  this.selectedPeerAmountConfirmed = false
                  this.mgrPeer.write(PeerSignalEncode.suggestPeerAmount(num))
                } else {
                  this.LogMsg('[ERROR] could not match peers, destroying')
                  this.terminate()
                }
              } else {
                if (num <= 0) {
                  num = 1
                } else if (num > this.maxNumPeers) {
                  num = this.maxNumPeers
                }
                this.selectedPeerAmount = num
                this.selectedPeerAmountConfirmed = false
                this.mgrPeer.write(PeerSignalEncode.suggestPeerAmount(num))
              }
            }
          }
          break
        case InternalWorkerComm.chunkData:
          {
            const cData = PeerSignalDecode.chunkData(recvData.data)
            this.chunkSize = cData.chunkSize
            let p = true
            const func = () => {
              this.selectedPeerAmount = this.maxNumPeers
              this.selectedPeerAmountConfirmed = false
              this.selectedPeerFailed = 0
              this.downloadedBytes = 0
              this.uploadedBytes = 0
              this.activeChunk = 0
              this.isActive = false
              this.transferStatusPaused = false
            }
            if (cData.role !== this.role) {
              if (this.isInTesting) {
                this.LogMsg(`Changing role to ${cData.role}`)
                this.role = cData.role
              } else {
                p = false
                this.LogMsg('Role mismatch')
                this.terminate()// Role differs from the requested one
              }
            }
            if (p) {
              if (cData.fileData.equals(this.fileData)) {
                this.LogMsg('Negotiating peers')
                func()
                this.mgrPeer.write(PeerSignalEncode.suggestPeerAmount(this.selectedPeerAmount))
              } else {
                if (this.isInTesting) {
                  this.LogMsg('Replacing local filedata with that of the remote client')
                  this.fileData = cData.fileData
                  this.file = new File([new Uint8Array(this.fileData.FileSize)], this.fileData.FileName)
                  func()
                  this.mgrPeer.write(PeerSignalEncode.suggestPeerAmount(this.selectedPeerAmount))
                } else {
                  this.LogMsg('FileData mismatch')
                  // console.log(this.fileData);
                  // console.log(cData.fileData);
                  this.terminate()// Requested/provided fileData differs from the requested one
                }
              }
            }
          }
          break
        case InternalWorkerComm.signal:
          {
            const s = PeerSignalDecode.signal(recvData.data)
            this.slavePeerReveiveSignal(s.peerID, s.signal)
          }
          break
        case InternalWorkerComm.bufferOverPause:

          this.transferStatusPaused = true

          break
        case InternalWorkerComm.Resume:

          this.transferStatusPaused = false
          if (this.file) {
            this.fUploadSend()
          } else {
            this.wsUploadSend()
          }

          break
        case InternalWorkerComm.requestChunk:
          {
            const a = PeerSignalDecode.requestChunk(recvData.data)
            this.respondChunk(a)
          }
          break
        case InternalWorkerComm.respondChunk:
          {
            const a = PeerSignalDecode.respondChunk(recvData.data)
            this.writeChunk(a.chunkID, a.chunk)
          }
          break
        case InternalWorkerComm.startTransfer:

          if (this.role === PeerRoles.upload) {
            this.LogMsg('Starting upload...')
            this.upload() // TODO: make an actual upload method
          }

          break
        case InternalWorkerComm.terminateTransfer:
          {
            const er = PeerSignalDecode.terminateTransfer(recvData.data)
            this.LogMsg(`Remote client requested termination, unexpected: ${er.errored}`)
            this.finishTransfer(!er.errored)
          }
          break
      }
    })
  }

  private createSlavePeers () {
    for (let i = 0; i < this.selectedPeerAmount; i++) {
      this.initSlavePeer(i, this.isInitial)
    }
    setTimeout(() => {
      if (!this.isActive) {
        this.LogMsg("[ERROR] It's been 20 seconds since first signal and peers are not ready. Assuming dead")
        this.terminate()
      }
    }, 20000)
  }

  private slavePeerSendSignal (peerID: number, signal: any) {
    this.mgrPeer.write(PeerSignalEncode.signal(peerID, signal))
  }

  private slavePeerReveiveSignal (peerID: number, signal: any) {
    const a = this.slavePeerMap.get(peerID)
    if (a) {
      a.peer.signal(signal)
    }
  }

  private slavePeerHandleError (peerID: number) {
    this.LogMsg(`Slave peer ${peerID} encountered an error`)
  }

  private slavePeerHandleClose (peerID: number) {
    this.LogMsg(`Slave peer ${peerID} has closed`)
  }

  private slavePeerNewReady () {
    let readyPeers = 0
    this.slavePeerMap.forEach((val) => {
      if (val.isReady) {
        readyPeers++
      }
    })
    if (readyPeers === this.selectedPeerAmount) {
      this.isActive = true
      this.LogMsg('All peers connected!')
      let msg = 'Peer high water marks: \n'
      this.slavePeerMap.forEach((val, key) => {
        msg += `Peer ${key}, writableHighWaterMark: ${val.peer.writableHighWaterMark}, readbaleHighWaterMark: ${val.peer.readableHighWaterMark}`
      })
      this.LogMsg(msg)
      if (this.role === PeerRoles.download) {
        this.download()
      } else if (this.role === PeerRoles.upload) {
        // TODO: do smth
      }
    }
  }

  private transferStatusPaused = false

  private downloadedBytes = 0
  private uploadedBytes = 0

  private uploaderStateInterval: NodeJS.Timer|undefined

  private downloaderInterval: NodeJS.Timer|undefined
  private downloaderStateInterval: NodeJS.Timer|undefined
  private activeChunk = 0
  private nextChunk = 0 // Next chunk to send

  private writingData = false

  private download () {
    this.downloadedBytes = 0
    this.LogMsg('Starting download...')
    if (this.rollingChunkMap === undefined) {
      this.LogMsg('RollingChunkMap is undefined...?')
      this.rollingChunkMap = new Map()
    }
    this.mgrPeer.write(PeerSignalEncode.startTransfer())
    this.stateMonitor?.startMonitoring()
    this.handleBuffer()
    this.downloaderStateInterval = setInterval(() => {
      this.LogMsg(`${Math.round((this.downloadedBytes / this.fileData.FileSize) * 10000) / 100}% downloaded (${this.fileData.FileSize - this.downloadedBytes} bytes remaining), recv chunks: ${this.recvChunks}`)
    }, 5000)
    setTimeout(() => {
      this.transferStateCheck()
    }, 3000)
  }

  private requestedChunkSet: Set<number> = new Set()
  private rollingChunkMap: Map<number, Uint8Array> = new Map()
  private slavePeerMap: Map<number, {isReady: boolean, currentChunk: number, peer: Peer.Instance}> = new Map()

  private shortCache: Map<number, Uint8Array> = new Map()
  private handleBuffer () {
    if (this.isActive) {
      const d = this.rollingChunkMap.get(this.activeChunk)
      if (d) {
        this.rollingChunkMap.delete(this.activeChunk)
        this.activeChunk++
        this.fileStream?.write(d).then(() => {
          this.downloadedBytes += d.byteLength
          this.stateMonitor?.setOffset(this.downloadedBytes)
          if (this.fileData.FileSize === this.downloadedBytes) {
            this.setToClose = true
            this.finishTransfer(true)
          } else if (this.fileData.FileSize < this.downloadedBytes) {
            this.LogMsg('[ERROR] File is corrupted...', 2)
            this.setToClose = true
            this.finishTransfer(true)
          } else { this.handleBuffer() }
        }, (err) => { this.LogMsg(err) })
      } else if (this.rollingChunkMap.size > this.selectedPeerAmount * 64) {
        this.LogMsg('Should be cancelled - buffer overflow', 2)
        this.terminate()
      } else if (this.rollingChunkMap.size > this.selectedPeerAmount * 4) {
        if (!this.transferStatusPaused && this.rollingChunkMap.size > this.selectedPeerAmount * 16) {
          this.mgrPeer.write(PeerSignalEncode.pauseTransfer())
          this.transferStatusPaused = true
        }
        this.LogMsg(`Warn: Missing array ${this.activeChunk}`)
        let a = false
        this.requestedChunkSet.forEach(el => {
          if (el === this.activeChunk) {
            a = true
          }
        })
        if (!a) {
          this.requestedChunkSet?.add(this.activeChunk)
          this.requestChunk(this.activeChunk)
        }
        setTimeout(() => {
          this.handleBuffer()
        }, 1000)
      } else {
        setTimeout(() => {
          this.handleBuffer()
        }, 1000)
      }
      if (this.transferStatusPaused && this.rollingChunkMap.size < this.selectedPeerAmount * 4) {
        this.mgrPeer.write(PeerSignalEncode.resumeTransfer())
        this.transferStatusPaused = false
      }
    }
  }

  private fileReader: FileReader|undefined
  // Does not actually "use" all peers. Loops through the chunkMap and writes data one peer at a time. If a peer is missing a chunk all peers effectively halt.
  private upload () {
    this.uploadedBytes = 0
    if (this.file !== undefined) {
      this.LogMsg('Uploading from file')
      this.uploadF()
    } else {
      this.LogMsg('Uploading from stream')
      this.uploadWs()
    }
    this.uploaderStateInterval = setInterval(() => {
      if (this.uploadedBytes === this.fileData.FileSize && this.uploaderStateInterval) {
        clearInterval(this.uploaderStateInterval)
        this.LogMsg('Upload finished, cleaning up')
      } else if (this.uploadedBytes > this.fileData.FileSize && this.uploaderStateInterval) {
        clearInterval(this.uploaderStateInterval)
        this.LogMsg('Upload corrupted, cleaning up')
      } else {
        this.LogMsg(`${Math.round((this.uploadedBytes / this.fileData.FileSize) * 10000) / 100}% uploaded (${this.fileData.FileSize - this.uploadedBytes} bytes remaining), arr size: ${this.rollingChunkMap.size}`)
      }
    }, 5000)
    setTimeout(() => {
      this.transferStateCheck()
    }, 3000)
  }

  private uploadWs () {
    if (this.fileStream instanceof WritableStreamForImagesAndStuff || this.fileStream instanceof WritableStreamForTransfer) {
      this.LogMsg('Creating handles...')
      // this.fileStream.on('newdata', (data:any)=>{
      //  if(this.isWritingToPreventCall === false){
      //    this.wsUploadSend();
      //  }
      // this.wsUploadSend();
      // });
      this.wsUploadSend()
    }
  }

  isWritingToPreventCall = false
  private wsUploadSend () {
    this.isWritingToPreventCall = true
    if (!this.transferStatusPaused) {
      const a = this.slavePeerMap.get(this.nextChunk % this.selectedPeerAmount)
      if (a !== undefined) {
        if (a.peer.bufferSize > (a.peer.writableHighWaterMark * 16)) { // Seems to drop to about 40kbps no matter what unless highwatermark is increased...
          this.LogMsg(`Pausing stream (peer ${this.nextChunk % this.selectedPeerAmount}), buffer size: ${a.peer.bufferSize}, writableHighWaterMark: ${a.peer.writableHighWaterMark}`)
          setTimeout(() => {
            this.wsUploadSend()
          }, 100)
        } else {
          if (this.fileStream instanceof WritableStreamForImagesAndStuff || this.fileStream instanceof WritableStreamForTransfer) {
            const uint = this.fileStream.getChunk(this.nextChunk)
            if (uint !== undefined) {
              a.peer.write(uint)
              a.currentChunk++
              this.uploadedBytes += uint.byteLength
              this.nextChunk++
              if (this.fileStream.hasChunk(this.nextChunk)) {
                setImmediate(() => { this.wsUploadSend() })
              } else {
                this.LogMsg('Uploader is faster than the downloader, waiting')
                setTimeout(() => {
                  this.wsUploadSend()
                }, 1000)
              }
            } else {
              this.LogMsg(`Peer ${this.nextChunk % this.selectedPeerAmount} missing chunk ${this.nextChunk}`)
              setTimeout(() => {
                this.wsUploadSend()
              }, 500)
            }
          }
        }
      } else {
        this.isWritingToPreventCall = false
        this.LogMsg(`Peer ${this.nextChunk % this.selectedPeerAmount} does not exist`)
      }
    } else {
      this.isWritingToPreventCall = false
    }
  }

  private uploadF () {
    this.fileReader = new FileReader()
    this.fileReader.onload = (e) => {
      const objt = <ArrayBuffer>e.target?.result
      if (objt) {
        const obj = new Uint8Array(objt)
        this.rollingChunkMap.set(this.activeChunk, obj)
        this.activeChunk++
        this.fUploadSend()
        this.fUploadReadNextChunk()
      }
    }
    setTimeout(() => {
      this.fUploadReadNextChunk()
    }, 100)
  }

  private readNextChunk = true
  private fUploadReadNextChunk () {
    if (this.readNextChunk) {
      if (this.rollingChunkMap.size < this.selectedPeerAmount * 16 && this.file) {
        if (this.activeChunk * this.chunkSize > this.fileData.FileSize) {
          this.LogMsg('Finished reading file')
        } else {
          this.fileReader?.readAsArrayBuffer(this.file.slice(this.activeChunk * this.chunkSize, (this.activeChunk + 1) * this.chunkSize))
        }
      } else {
        setTimeout(() => {
          this.fUploadReadNextChunk()
        }, 1000)
      }
    }
  }

  private fUploadSend () {
    if (!this.transferStatusPaused) {
      const a = this.slavePeerMap.get(this.nextChunk % this.selectedPeerAmount)
      if (a !== undefined) {
        if (a.peer.bufferSize > a.peer.writableHighWaterMark) {
          setTimeout(() => {
            this.fUploadSend()
          }, 100)
        } else {
          const uint = this.rollingChunkMap.get(this.nextChunk)
          if (uint) {
            a.peer.write(uint)
            a.currentChunk++
            this.uploadedBytes += uint.byteLength
            this.rollingChunkMap.delete(this.nextChunk)
            this.nextChunk++
            if (this.rollingChunkMap.has(this.nextChunk)) {
              setImmediate(() => { this.fUploadSend() })
            }
          } else {
            // this.LogMsg(`Peer ${this.nextChunk%this.selectedPeerAmount} missing chunk ${this.nextChunk}`);
          }
        }
      } else {
        this.LogMsg(`Peer ${this.nextChunk % this.selectedPeerAmount} does not exist`)
      }
    } else {
      this.LogMsg('Transfer is paused?')
    }
  }

  private requestChunk (chunkID: number) {
    this.LogMsg(`Requesting ${chunkID}`)
    if (!this.requestedChunkSet.has(chunkID)) {
      this.requestedChunkSet.add(chunkID)
      this.mgrPeer.write(PeerSignalEncode.requestChunk(chunkID))
    }
  }

  private respondChunk (chunkID: number) {
    this.LogMsg(`Remote client requested ${chunkID}`)
    if (chunkID * this.chunkSize < this.fileData.FileSize) {
      this.readChunk(chunkID).then(chunk => {
        this.mgrPeer.write(PeerSignalEncode.respondChunk(chunkID, chunk))
      })
    }
  }

  private writeChunk (chunkID: number, chunk:Uint8Array) {
    if (this.requestedChunkSet.has(chunkID)) {
      this.rollingChunkMap.set(chunkID, chunk)
      this.requestedChunkSet.delete(chunkID)
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

  recvChunks = 0
  private initSlavePeer (peerID: number, initial: boolean) {
    const peer = new Peer({ initiator: initial, trickle: true, config: UserConfig.getPeerConfig() })
    this.slavePeerMap.set(peerID, { isReady: false, currentChunk: peerID, peer: peer })
    peer.on('signal', (data) => {
      this.slavePeerSendSignal(peerID, data)
    })
    peer.on('error', err => {
      this.LogMsg(`Peer ${peerID} got an error: ${err}`)
      this.slavePeerHandleError(peerID)
    })
    peer.on('close', () => {
      this.LogMsg(`Peer ${peerID} was closed`)
      this.slavePeerHandleClose(peerID)
    })
    peer.on('connect', () => {
      const pData = this.slavePeerMap.get(peerID)
      if (pData) {
        pData.isReady = true
        this.slavePeerNewReady()
      }
    })
    peer.on('data', (c) => {
      const pData = this.slavePeerMap.get(peerID)
      this.recvChunks++
      if (pData) {
        // let newChunk = pData.currentChunk*(peerID+1)-pData.currentChunk;
        // if(newChunk>=this.activeChunk){
        this.rollingChunkMap.set(pData.currentChunk, c)
        // }
        // this.missingChunkSet.delete(newChunk);
        pData.currentChunk += this.selectedPeerAmount
      }
    })
  }

  private finishTransfer (success: boolean) {
    if (!this.closing) {
      this.closing = true
      this.setToClose = success
      this.mgrPeer.send(PeerSignalEncode.terminateTransfer(!success))
      this.LogMsg(`Closing (pass: ${success})...`)
      if (this.role === PeerRoles.download) {
        let blob
        if (this.fileStream instanceof WritableStreamForImagesAndStuff) {
          blob = this.fileStream.get()
        }
        this.stateMonitor?.setFinished(success, blob)
      }
      this.destroyObjts()
      this.emit(WorkerComm.finished, { success: success })
    }
  }

  cancel () {
    this.terminate()
  }

  private terminate () {
    if (!this.closing) {
      this.closing = true
      this.LogMsg(`Terminating (pass: ${this.setToClose})...`)
      this.mgrPeer.send(PeerSignalEncode.terminateTransfer(true))
      this.destroyObjts()
      this.stateMonitor?.setFinished(false, undefined)
      // this.stateMonitor?.cancelDownload();
      this.emit(WorkerComm.finished, { success: false })
    }
  }

  private destroyObjts () {
    try {
      if (this.role === PeerRoles.download) {
        if (this.setToClose) {
          this.fileStream?.close()
        } else {
          this.fileStream?.abort()
        }
      }
      this.isReadyForSlavePeerComm = false
      this.readNextChunk = false
      this.isActive = false
      if (this.downloaderInterval) { clearInterval(this.downloaderInterval) }
      if (this.downloaderStateInterval) { clearInterval(this.downloaderStateInterval) }
      if (this.uploaderStateInterval) { clearInterval(this.uploaderStateInterval) }

      this.slavePeerMap.forEach(val => {
        val.peer.destroy()
      })
      this.mgrPeer.destroy()
      // this.missingChunkSet = new Set();
      this.rollingChunkMap = new Map()
      this.slavePeerMap = new Map()
    } catch (e) {
      this.LogMsg(`While terminating got an error: ${e}`)
    }
  }

  private LogMsg (msg: string, loglevel = 2) {
    Logger.Msg('Download WebWorker', msg, loglevel)
  }
}
