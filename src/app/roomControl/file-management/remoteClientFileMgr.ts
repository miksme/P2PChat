import { EventEmitter } from 'eventemitter3'
import { PeerPasstrough } from './SFUPeerPasstrough'
import { FileErrors, WorkerComm } from './../file-management/fileHelpers'
import { Logger } from './../../helpers/logMsg'
import { UserConfig } from 'src/app/config/config'
import { DecodeSignal, EncodeSignal } from '../file-management/handleFileSignals'
import { TransferType, FileMgrSignals } from '../../helpers/FileMgr.enums'
import { FileData } from './../../helpers/fileData'
export class RemoteClientFileMgr extends EventEmitter {
  private userFileMap: Map<string, Map<string, FileData>> = new Map()
  private localAcIdentificator = 0
  private remoteActionsWithLocalIndetificator: Map<number, {dwld: string, dwldAcID: number, upld: string, upldAcID: number|undefined, file:FileData, tType: TransferType, negotiationState: number, obj:any}> = new Map()
  private remoteActionMap: Map<string, Map<string, Map<number, number>>> = new Map() // fromUser toUser userAc localIdentificator

  addFile (UserID: string, file: FileData): void {
    if (!this.userFileMap.has(UserID)) {
      this.userFileMap.set(UserID, new Map())
    }
    this.userFileMap.get(UserID)?.set(file.FileID, file)
  }

  removeFile (UserID: string, FileID: string): void {
    this.userFileMap.get(UserID)?.delete(FileID)
  }

  getFile (UserID: string, FileID: string): FileData|undefined {
    return this.userFileMap.get(UserID)?.get(FileID)
  }

  getFileList (UserID: string): FileData[] {
    const a = this.userFileMap.get(UserID)
    if (a) {
      return Array.from(a.values())
    } else {
      return []
    }
  }

  private getNextIdentificator () {
    return this.localAcIdentificator++
  }

  private initAcMap (usr1: string, usr2: string) {
    let a = this.remoteActionMap.get(usr1)?.get(usr2)
    if (a === undefined) {
      a = new Map()
      let b = this.remoteActionMap.get(usr1)
      if (b === undefined) { b = new Map() }
      b.set(usr2, a)
      this.remoteActionMap.set(usr1, b)
    }
  }

  private emitSignal (fromUser: string, toUser: string, data:any) {
    this.emit(WorkerComm.signal, { fromUser: fromUser, toUser: toUser, data: data })
  }

  signal (fromUser: string, toUser: string, signal: {type:FileMgrSignals, idata:any}) {
    switch (signal.type) {
      case FileMgrSignals.downloadFile:
        this.downloadFile(fromUser, toUser, signal.idata)
        break
      case FileMgrSignals.ackR:
        this.ackR(fromUser, toUser, signal.idata)
        break
      case FileMgrSignals.uploadChunk:
        this.uploadChunk(fromUser, toUser, signal.idata)
        break
      case FileMgrSignals.signalPeer:
        this.signalPeer(fromUser, toUser, signal.idata)
        break
      case FileMgrSignals.finished:
        this.finished(fromUser, toUser, signal.idata)
        break
      case FileMgrSignals.error:
        this.error(fromUser, toUser, signal.idata)
        break
    }
  }

  private downloadFile (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.downloadFile(_data)
    RemoteClientFileMgr.LogMsg('FileMgrSignals.remote.downloadFile called', 2)
    const fileData = this.userFileMap.get(toUser)?.get(data.FileID)
    if (fileData) {
      const id = this.getNextIdentificator()
      RemoteClientFileMgr.LogMsg('FileMgrSignals.downloadFile generating request', 2)
      this.remoteActionsWithLocalIndetificator.set(id, { dwld: fromUser, dwldAcID: data.sendersAcID, upld: toUser, upldAcID: undefined, obj: undefined, tType: data.type, negotiationState: 0, file: fileData })
      this.initAcMap(fromUser, toUser)
      this.remoteActionMap.get(fromUser)?.get(toUser)?.set(data.sendersAcID, id)
      this.emitSignal(fromUser, toUser, EncodeSignal.downloadFile(data.FileID, data.ChunkSize, data.type, data.Timeout, data.sendersAcID))
    } else {
      this.emitSignal(toUser, fromUser, EncodeSignal.error(-1, data.sendersAcID, FileErrors.noSuchFile))
    }
  }

  private ackR (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.ackR(_data)
    const acData = this.remoteActionMap.get(toUser)?.get(fromUser)?.get(data.receiversAcID)
    if (acData !== undefined) {
      const action = this.remoteActionsWithLocalIndetificator.get(acData)
      if (action) {
        if (action.negotiationState === 0 && fromUser === action.upld) {
          this.initAcMap(fromUser, toUser)
          this.remoteActionMap.get(fromUser)?.get(toUser)?.set(data.sendersAcID, acData)
          action.upldAcID = data.sendersAcID
          action.negotiationState = 1
        } else {
          action.negotiationState = 2
          if (data.type === TransferType.useWorkers && action.tType === TransferType.useWorkers && action.obj === undefined) {
            RemoteClientFileMgr.LogMsg(`Creating a PeerPasstrough to transfer ${action.file.FileID} from ${action.upld} to ${action.dwld}`)
            const pstrgh = new PeerPasstrough(action.upld, action.dwld, action.file, UserConfig.fileWorkerPeerAmount)
            pstrgh.on(WorkerComm.signal, (eventData:{
              from: string;
              to: string;
              data: any;
              }) => {
              let sendersAcID = data.sendersAcID
              let receiversAcID = data.receiversAcID
              if (eventData.from === toUser) {
                sendersAcID = data.receiversAcID
                receiversAcID = data.sendersAcID
              }
              this.emitSignal(eventData.from, eventData.to, EncodeSignal.signalPeer(receiversAcID, sendersAcID, eventData.data))
            })
            pstrgh.on(WorkerComm.finished, (eventData:{
              from: string;
              to: string;
              data: boolean;
              }) => {
              if (this.destroyObj(eventData.from, eventData.to, data.sendersAcID)) {
                const sendersAcID = fromUser === eventData.from ? data.sendersAcID : data.receiversAcID
                this.emitSignal(eventData.from, eventData.to, EncodeSignal.finished(data.receiversAcID, sendersAcID, eventData.data))
              }
            })
            action.obj = pstrgh
          }
        }
        action.tType = data.type
        this.emitSignal(fromUser, toUser, EncodeSignal.ackR(data.receiversAcID, data.sendersAcID, data.type))
      } else {
        this.destroyObj(fromUser, toUser, data.sendersAcID)
        this.emitSignal(toUser, fromUser, EncodeSignal.error(-1, data.sendersAcID, FileErrors.cancel))
      }
    } else {
      this.destroyObj(fromUser, toUser, data.sendersAcID)
      this.emitSignal(toUser, fromUser, EncodeSignal.error(-1, data.sendersAcID, FileErrors.cancel))
    }
  }

  private uploadChunk (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.uploadChunk(_data)
    const acData = this.remoteActionMap.get(fromUser)?.get(toUser)?.get(data.sendersAcID)
    if (acData !== undefined) {
      const action = this.remoteActionsWithLocalIndetificator.get(acData)
      if (action) {
        if (action.negotiationState >= 2 && fromUser === action.upld) {
          this.emitSignal(fromUser, toUser, EncodeSignal.uploadChunk(data.sendersAcID, data.ChunkID, data.Chunk))
        } else {
          RemoteClientFileMgr.LogMsg(`${fromUser} tried to send data to ${toUser} although it should not be possible`)
        }
      }
    }
  }

  private signalPeer (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.signalPeer(_data)
    const acData = this.remoteActionMap.get(fromUser)?.get(toUser)?.get(data.sendersAcID)
    if (acData !== undefined) {
      const action = this.remoteActionsWithLocalIndetificator.get(acData)
      if (action) {
        if (action.negotiationState >= 2) {
          if (action.tType === TransferType.overMain) {
            this.emitSignal(fromUser, toUser, EncodeSignal.signalPeer(data.receiversAcID, data.sendersAcID, data.signal))
          } else {
            if (action.obj instanceof PeerPasstrough) {
              action.obj.signal(fromUser, data.signal)
            } else {
              RemoteClientFileMgr.LogMsg(`Creating a PeerPasstrough to transfer ${action.file.FileID} from ${action.upld} to ${action.dwld}`)
              const pstrgh = new PeerPasstrough(action.upld, action.dwld, action.file, UserConfig.fileWorkerPeerAmount)
              pstrgh.on(WorkerComm.signal, (eventData:{
                from: string;
                to: string;
                data: any;
                }) => {
                let sendersAcID = data.sendersAcID
                let receiversAcID = data.receiversAcID
                if (eventData.from === toUser) {
                  sendersAcID = data.receiversAcID
                  receiversAcID = data.sendersAcID
                }
                this.emitSignal(eventData.from, eventData.to, EncodeSignal.signalPeer(receiversAcID, sendersAcID, eventData.data))
              })
              pstrgh.on(WorkerComm.finished, (eventData:{
                from: string;
                to: string;
                data: boolean;
                }) => {
                if (this.destroyObj(eventData.from, eventData.to, data.sendersAcID)) {
                  const sendersAcID = fromUser === eventData.from ? data.sendersAcID : data.receiversAcID
                  this.emitSignal(eventData.from, eventData.to, EncodeSignal.finished(data.receiversAcID, sendersAcID, eventData.data))
                }
              })
              pstrgh.signal(fromUser, data.signal)
              action.obj = pstrgh
              action.negotiationState = 3
            }
          }
        } else {
          RemoteClientFileMgr.LogMsg(`${fromUser} tried to send data to ${toUser} although it should not be possible`)
        }
      }
    }
  }

  private finished (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.finished(_data)
    if (this.destroyObj(fromUser, toUser, data.sendersAcID)) {
      this.emitSignal(fromUser, toUser, EncodeSignal.finished(data.receiversAcID, data.sendersAcID, data.success))
    }
  }

  private error (fromUser: string, toUser: string, _data: any) {
    const data = DecodeSignal.error(_data)
    if (this.destroyObj(fromUser, toUser, data.sendersAcID)) {
      this.emitSignal(fromUser, toUser, EncodeSignal.error(data.receiversAcID, data.sendersAcID, data.error))
    }
  }

  private static LogMsg (msg:any, loglevel = 3) {
    Logger.Msg('Remote user file mgr', msg, loglevel)
  }

  private destroyObj (fromUser: string, toUser: string, sendersAcID: number) {
    const acData = this.remoteActionMap.get(fromUser)?.get(toUser)?.get(sendersAcID)
    if (acData) {
      const action = this.remoteActionsWithLocalIndetificator.get(acData)
      if (action) {
        if (action.obj instanceof PeerPasstrough) {
          action.obj.destroy()
        }
        const otherID = fromUser === action.dwld ? action.upldAcID : action.dwldAcID
        if (otherID) { this.remoteActionMap.get(toUser)?.get(fromUser)?.delete(otherID) }
        this.remoteActionsWithLocalIndetificator.delete(acData)
      }
      this.remoteActionMap.get(fromUser)?.get(toUser)?.delete(sendersAcID)
      return true
    }
    return false
  }

  private getVertAction (fromUser: string, toUser: string, fromID?: number, toID?:number) {
    let ver
    if (fromID) {
      const a = this.remoteActionMap.get(fromUser)?.get(toUser)?.get(fromID)
      if (a) {
        const b = this.remoteActionsWithLocalIndetificator.get(a)
        if (b) {
          ver = b
        }
      }
    }
    if (ver === undefined && toID) {
      const a = this.remoteActionMap.get(toUser)?.get(fromUser)?.get(toID)
      if (a) {
        const b = this.remoteActionsWithLocalIndetificator.get(a)
        if (b) {
          ver = b
        }
      }
    }
    return ver
  }
}
