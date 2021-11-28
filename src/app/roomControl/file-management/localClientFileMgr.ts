import { EncodeLocalSignal, DecodeSignal, EncodeSignal } from './handleFileSignals'
import { FileTransferOverMain } from './fileTransfer/overMain'
import { FileDownloadState } from './fileDownloadState'
import { WritableStreamForImagesAndStuff } from './downloadToDisplay'
import { EventEmitter } from 'eventemitter3'
import { FileErrors, WorkerComm } from './fileHelpers'
import { Logger } from '../../helpers/logMsg'
import { UserConfig } from 'src/app/config/config'
import { TransferType, FileMgrSignals } from '../../helpers/FileMgr.enums'
import { FileData } from '../../helpers/fileData'
import { DownloaderHandles, PeerFileTransfer, UploaderHandles } from './fileTransfer/withMultiple'
export class LocalClientFileMgr extends EventEmitter {
  private localFileMap: Map<string, {file: File, fileData: FileData}> = new Map()
  private remoteFileMap: Map<string, Map<string, FileData>> = new Map()
  private localAcIdentificator = 0
  private localFileID = 0
  private actionsWithLocalIndetificator: Map<number, {remoteUser: string, remoteUserAcID: number, localUserAcID: number, file:FileData, isDownload: boolean,
                                                      tType: TransferType, negotiationState: number, stateMonitor:FileDownloadState|undefined, writable:any,
                                                      obj: any}> = new Map()

  private remoteActionMap: Map<string, Map<number, number>> = new Map() // fromUser toUser userAc localIdentificator
  private localActionMap: Map<number, number> = new Map()
  private actionQueue: Set<number> = new Set()
  private getWriteFunction (acID: number, UserID: string) {
    this.emit(WorkerComm.giveData, EncodeLocalSignal.requestPeerHandle(UserID, acID))
  }

  public giveWriteFunction (acID: number, func:()=>boolean) {
    const a = this.actionsWithLocalIndetificator.get(acID)
    if (a) {
      a.writable = func
    }
  }

  addRemoteFile (UserID: string, file: FileData): void {
    if (!this.remoteFileMap.has(UserID)) {
      this.remoteFileMap.set(UserID, new Map())
    }
    this.remoteFileMap.get(UserID)?.set(file.FileID, file)
  }

  removeRemoteFile (UserID: string, FileID: string): void {
    this.remoteFileMap.get(UserID)?.delete(FileID)
  }

  getRemoteFile (UserID: string, FileID: string): FileData|undefined {
    return this.remoteFileMap.get(UserID)?.get(FileID)
  }

  getRemoteFileList (UserID: string): FileData[] {
    const a = this.remoteFileMap.get(UserID)
    if (a) {
      return Array.from(a.values())
    } else {
      return []
    }
  }

  addFile (file: File): FileData {
    const fileData = new FileData(this.getNextFileID(), file.size, file.name.length > 80 ? file.name.slice(0, 80) : file.name)
    this.localFileMap.set(fileData.FileID, { file: file, fileData: fileData })
    return fileData
  }

  removeFile (FileID: string): void {
    this.localFileMap.delete(FileID)
  }

  getFile (FileID: string): FileData|undefined {
    return this.localFileMap.get(FileID)?.fileData
  }

  getFileList (): FileData[] {
    const a = new Array<FileData>(this.localFileMap.size)
    let c = 0
    this.localFileMap.forEach(v => {
      a[c++] = v.fileData
    })
    return a
  }

  download (UserID: string, FileID: string, writableStream:WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff): FileDownloadState|undefined {
    LocalClientFileMgr.LogMsg(`Starting download of ${FileID} from ${UserID}`)
    const fileData = this.remoteFileMap.get(UserID)?.get(FileID)
    if (fileData) {
      let alrdyDownloading = false
      this.localActionMap.forEach(el => {
        const a = this.actionsWithLocalIndetificator.get(el)
        if (a) {
          if (a.remoteUser === UserID && a.file.FileID === FileID && a.isDownload) {
            alrdyDownloading = true
          }
        }
      })
      if (!alrdyDownloading) {
        const useWorker = UserConfig.useWorkersForFiles && fileData.FileSize >= UserConfig.fileSizeBoundaryForWorker
        const fileState = new FileDownloadState(fileData.FileSize)
        const acID = this.getNextIdentificator()
        this.actionsWithLocalIndetificator.set(acID, {
          remoteUser: UserID,
          remoteUserAcID: -1,
          localUserAcID: acID,
          file: fileData,
          isDownload: true,
          tType: useWorker ? TransferType.useWorkers : TransferType.overMain,
          negotiationState: -1,
          stateMonitor: fileState,
          writable: writableStream,
          obj: undefined
        })
        this.addToQueue(acID)
        return fileState
      }
    }
    return undefined
  }

  private remove (ac: number) {
    this.removeFromQueue(ac)
    this.actionsWithLocalIndetificator.delete(ac)
  }

  private removeFromQueue (ac: number) {
    this.actionQueue.delete(ac)
  }

  private addToQueue (ac: number) {
    this.actionQueue.add(ac)
    this.checkQueue()
  }

  private checkQueue () {
    this.actionQueue.forEach(el => {
      if (UserConfig.maxActiveFileActions > UserConfig.globalActiveActionCount) {
        const data = this.actionsWithLocalIndetificator.get(el)
        if (data) {
          LocalClientFileMgr.LogMsg('Last check before start')
          let allow = false
          if (data.tType === TransferType.overMain && UserConfig.maxActiveSingleThreadFileActions > UserConfig.globalActiveSingleThreadActionCount) {
            UserConfig.globalActiveSingleThreadActionCount++
            allow = true
          } else if (data.tType === TransferType.useWorkers) {
            allow = true
          }
          if (allow) {
            LocalClientFileMgr.LogMsg(`Starting ${data.isDownload ? 'down' : 'up'}load of ${data.file.FileID} to ${data.remoteUser}}`)
            UserConfig.globalActiveActionCount++
            data.negotiationState = 0
            this.localActionMap.set(el, el)
            this.initAcMap(data.remoteUser)
            if (data.isDownload) {
              this.emitSignal(data.remoteUser, EncodeSignal.downloadFile(data.file.FileID, 16 * 1024, data.tType, 60, data.localUserAcID))
            } else {
              this.remoteActionMap.get(data.remoteUser)?.set(data.remoteUserAcID, el)
              this.emitSignal(data.remoteUser, EncodeSignal.ackR(data.remoteUserAcID, data.localUserAcID, data.tType))
            }
            this.actionQueue.delete(el)
          }
        }
      }
    })
  }

  private getNextFileID () {
    return (this.localFileID++).toString()
  }

  private getNextIdentificator () {
    return this.localAcIdentificator++
  }

  private initAcMap (usr1: string) {
    let b = this.remoteActionMap.get(usr1)
    if (b === undefined) { b = new Map() }
    this.remoteActionMap.set(usr1, b)
  }

  private emitSignal (toUser: string, data:any) {
    this.emit(WorkerComm.signal, { toUser: toUser, data: data })
  }

  signal (fromUser: string, signal: {type:FileMgrSignals, idata:any}) {
    switch (signal.type) {
      case FileMgrSignals.downloadFile:
        this.downloadFile(fromUser, signal.idata)
        break
      case FileMgrSignals.ackR:
        this.ackR(fromUser, signal.idata)
        break
      case FileMgrSignals.uploadChunk:
        this.uploadChunk(fromUser, signal.idata)
        break
      case FileMgrSignals.signalPeer:
        this.signalPeer(fromUser, signal.idata)
        break
      case FileMgrSignals.finished:
        this.finished(fromUser, signal.idata)
        break
      case FileMgrSignals.error:
        this.error(fromUser, signal.idata)
        break
    }
  }

  private downloadFile (fromUser: string, _data: any) {
    const data = DecodeSignal.downloadFile(_data)
    const fileData = this.localFileMap.get(data.FileID)
    if (fileData) {
      LocalClientFileMgr.LogMsg(`Vertifying the upload of ${data.FileID} to ${fromUser}}`)
      let alrdyUploading = false
      this.localActionMap.forEach(el => {
        const a = this.actionsWithLocalIndetificator.get(el)
        if (a) {
          if (a.remoteUser === fromUser && a.file.FileID === data.FileID && !a.isDownload) {
            alrdyUploading = true
          }
        }
      })
      if (!alrdyUploading) {
        const useWorker = UserConfig.useWorkersForFiles && fileData.fileData.FileSize >= UserConfig.fileSizeBoundaryForWorker
        const acID = this.getNextIdentificator()
        if (data.type === TransferType.overMain || (data.type === TransferType.useWorkers && useWorker)) {
          LocalClientFileMgr.LogMsg(`Push upload of ${data.FileID} to ${fromUser}} into the queue`)
          this.actionsWithLocalIndetificator.set(acID, {
            remoteUser: fromUser,
            remoteUserAcID: data.sendersAcID,
            localUserAcID: acID,
            file: fileData.fileData,
            isDownload: false,
            tType: data.type,
            negotiationState: -1,
            stateMonitor: undefined,
            writable: undefined,
            obj: undefined
          })
          this.getWriteFunction(acID, fromUser)
          this.addToQueue(acID)
        } else {
          LocalClientFileMgr.LogMsg('Cannot match requested type... declinening')
          this.finishFileActionWithError(fromUser, -1, data.sendersAcID, FileErrors.cancel)
        }
      }
    } else {
      LocalClientFileMgr.LogMsg(`No such file - ${data.FileID}`)
      this.finishFileActionWithError(fromUser, -1, data.sendersAcID, FileErrors.noSuchFile)
    }
  }

  private ackR (fromUser: string, _data: any) {
    const data = DecodeSignal.ackR(_data)
    const acIdentificator = this.getVertActionID(fromUser, data.receiversAcID, data.sendersAcID)
    if (acIdentificator !== undefined) {
      const action = this.actionsWithLocalIndetificator.get(acIdentificator)
      if (action && action.remoteUser === fromUser) {
        if (action.tType === data.type) {
          action.negotiationState++
          if (action.negotiationState === 1) {
            action.remoteUserAcID = data.sendersAcID
            this.remoteActionMap.get(action.remoteUser)?.set(data.sendersAcID, acIdentificator)
            if (action.isDownload) {
              if (action.tType === TransferType.overMain) {
                LocalClientFileMgr.LogMsg(`Creating FileTransferOverMain for ${fromUser}:${action.file.FileID}`)
                const a = new FileTransferOverMain(action.file, new DownloaderHandles(action.writable, action.stateMonitor))
                a.on(WorkerComm.signal, (ChunkID:number) => {
                  if (action) { this.emitSignal(fromUser, EncodeSignal.signalPeer(action.remoteUserAcID, action.localUserAcID, ChunkID)) }
                })
                a.on(WorkerComm.finished, (success:boolean) => {
                  if (action) {
                    LocalClientFileMgr.LogMsg('FileTransferOverMain called finish')
                    this.finishFileAction(action.localUserAcID, success)
                  }

                  // this.emitSignal(fromUser, EncodeSignal.finished(action.localUserAcID, success))
                })
                action.obj = a
              } else if (action.tType === TransferType.useWorkers) {
                LocalClientFileMgr.LogMsg(`Creating PeerFileTransfer for ${fromUser}:${action.file.FileID}`)
                const a = new PeerFileTransfer(UserConfig.fileWorkerPeerAmount, false, action.file, new DownloaderHandles(action.writable, action.stateMonitor))
                a.on(WorkerComm.signal, data => {
                  if (action) { this.emitSignal(fromUser, EncodeSignal.signalPeer(action.remoteUserAcID, action.localUserAcID, data)) }
                })
                a.on(WorkerComm.finished, (success:boolean) => {
                  if (action) {
                    LocalClientFileMgr.LogMsg('PeerFileTransfer called finish')
                    this.finishFileAction(action.localUserAcID, success)
                  }

                  // this.emitSignal(fromUser, EncodeSignal.finished(action.localUserAcID, success))
                })
                action.obj = a
              }
              this.emitSignal(fromUser, EncodeSignal.ackR(action.remoteUserAcID, action.localUserAcID, action.tType))
            } else {
              const fData = this.localFileMap.get(action.file.FileID)
              if (fData?.file) {
                if (action.tType === TransferType.overMain) {
                  const a = new FileTransferOverMain(action.file, new UploaderHandles(fData.file, action.writable))
                  a.on(WorkerComm.signal, (idata:{ChunkID:number, Chunk:Uint8Array}) => {
                    if (action) { this.emitSignal(fromUser, EncodeSignal.uploadChunk(action.localUserAcID, idata.ChunkID, idata.Chunk)) }
                  })
                  a.on(WorkerComm.finished, (success:boolean) => {
                    if (action) {
                      LocalClientFileMgr.LogMsg('FileTransferOverMain called finish')
                      this.finishFileAction(action.localUserAcID, success)
                    }

                    // this.emitSignal(fromUser, EncodeSignal.finished(action.localUserAcID, success))
                  })
                  action.obj = a
                } else if (action.tType === TransferType.useWorkers) {
                  const a = new PeerFileTransfer(UserConfig.fileWorkerPeerAmount, true, action.file, new UploaderHandles(fData.file, undefined))
                  a.on(WorkerComm.signal, data => {
                    if (action) { this.emitSignal(fromUser, EncodeSignal.signalPeer(action.remoteUserAcID, action.localUserAcID, data)) }
                  })
                  a.on(WorkerComm.finished, (success:boolean) => {
                    if (action) {
                      LocalClientFileMgr.LogMsg('PeerFileTransfer called finish')
                      this.finishFileAction(action.localUserAcID, success)
                    }

                    // this.emitSignal(fromUser, EncodeSignal.finished(action.localUserAcID, success))
                  })
                  action.obj = a
                }
              }
            }
          } else {
            LocalClientFileMgr.LogMsg(`negotiationState reached an impossbile value: ${action.negotiationState}`)
          }
        } else {
          LocalClientFileMgr.LogMsg('Transfer type mismatch... canceling')
          this.finishFileActionWithError(action.remoteUser, action.localUserAcID, action.remoteUserAcID, FileErrors.cancel)
        }
      }
    }
  }

  private uploadChunk (fromUser: string, _data: any) {
    const data = DecodeSignal.uploadChunk(_data)
    const acIdentificator = this.getVertActionID(fromUser, undefined, data.sendersAcID)
    if (acIdentificator !== undefined) {
      const action = this.actionsWithLocalIndetificator.get(acIdentificator)
      if (action?.obj instanceof FileTransferOverMain && action.isDownload) {
        action.obj.addChunk(data.ChunkID, data.Chunk)
      }
    }
  }

  private signalPeer (fromUser: string, _data: any) {
    const data = DecodeSignal.signalPeer(_data)
    const acIdentificator = this.getVertActionID(fromUser, data.receiversAcID, data.sendersAcID)
    if (acIdentificator !== undefined) {
      const action = this.actionsWithLocalIndetificator.get(acIdentificator)
      if (action?.obj instanceof FileTransferOverMain && !action.isDownload) {
        action.obj.recvReqChunk(data.signal)
      } else if (action?.obj instanceof PeerFileTransfer) {
        action.obj.signal(data.signal)
      }
    }
  }

  private finished (fromUser: string, _data: any) {
    const data = DecodeSignal.finished(_data)
    const _a = this.getVertActionID(fromUser, data.receiversAcID, data.sendersAcID)
    if (_a) {
      LocalClientFileMgr.LogMsg('Remote user called finish')
      this.finishFileAction(_a, data.success, false)
    }
  }

  private error (fromUser: string, _data: any) {
    const data = DecodeSignal.error(_data)
    const i = this.getVertActionID(fromUser, data.receiversAcID, data.sendersAcID)
    if (i !== undefined) {
      const a = this.actionsWithLocalIndetificator.get(i)
      if (a) {
        if (a.isDownload && a.tType === TransferType.useWorkers && a.negotiationState === 0) {
          LocalClientFileMgr.LogMsg(`Retrying to request the download of ${a.tType} over main`)
          const acID = this.getNextIdentificator()
          this.actionsWithLocalIndetificator.set(acID, {
            remoteUser: fromUser,
            remoteUserAcID: -1,
            localUserAcID: acID,
            file: a.file,
            isDownload: true,
            tType: TransferType.overMain,
            negotiationState: -1,
            stateMonitor: a.stateMonitor,
            writable: a.writable,
            obj: undefined
          })
          this.addToQueue(acID)
        }
        LocalClientFileMgr.LogMsg('Remote user called cancel')
        this.finishFileActionWithError(fromUser, a.localUserAcID, data.sendersAcID, data.error)
      }
    }
  }

  private finishFileAction (localAc: number, success: boolean, send = true) {
    const a = this.actionsWithLocalIndetificator.get(localAc)
    if (a !== undefined) {
      if (send) {
        this.emitSignal(a.remoteUser, EncodeSignal.finished(a.localUserAcID, a.remoteUserAcID, success))
      }
      this.destroyObj(localAc)
    }
  }

  private finishFileActionWithError (remoteUser: string, localAc:number, remoteAc: number, error: FileErrors) {
    this.emitSignal(remoteUser, EncodeSignal.error(localAc, remoteAc, error))
    const _a = this.remoteActionMap.get(remoteUser)?.get(remoteAc)
    if (_a !== undefined) {
      this.destroyObj(_a)
    }
  }

  private destroyObj (acID: number) {
    LocalClientFileMgr.LogMsg('Destroying object')
    const a = this.actionsWithLocalIndetificator.get(acID)
    if (a !== undefined) {
      this.remoteActionMap.get(a.remoteUser)?.delete(a.remoteUserAcID)
      this.localActionMap.delete(a.localUserAcID)
      UserConfig.globalActiveActionCount--
      if (a.obj instanceof FileTransferOverMain) {
        UserConfig.globalActiveSingleThreadActionCount--
      }
      a.obj = undefined
      this.actionsWithLocalIndetificator.delete(acID)
      this.checkQueue()
    }
  }

  private getVertActionID (remoteUser: string, localID?: number, remoteID?: number) {
    let ver
    if (remoteID !== undefined) {
      const a = this.remoteActionMap.get(remoteUser)?.get(remoteID)
      if (a !== undefined) {
        ver = a
      }
    }
    if (ver === undefined && localID !== undefined) {
      const a = this.localActionMap.get(localID)
      if (a !== undefined) {
        ver = a
      }
    }
    return ver
  }

  private static LogMsg (msg:any, loglevel = 3) {
    Logger.Msg('Local user file mgr', msg, loglevel)
  }

  private logAll (data:any) {
    console.log('Remote map')
    console.log(this.remoteActionMap)
    console.log('Local map')
    console.log(this.localActionMap)
    console.log('ac map')
    console.log(this.actionsWithLocalIndetificator)
    console.log('ac queue')
    console.log(this.actionQueue)
    console.log('data')
    console.log(data)
  }
}
