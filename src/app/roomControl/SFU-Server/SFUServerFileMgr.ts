import { WorkerComm } from './../file-management/fileHelpers'
import { FileDownloadState } from '../file-management/fileDownloadState'
import { WritableStreamForImagesAndStuff } from '../file-management/downloadToDisplay'
import { FileData } from './../../helpers/fileData'
import { EventEmitter } from 'eventemitter3'
import { FileMgrPublicInterface } from './../../interfaces/FileMgr.public.interface'
import { RemoteClientFileMgr } from '../file-management/remoteClientFileMgr'
import { LocalClientFileMgr } from '../file-management/localClientFileMgr'

export class SFUServerFileMgr extends EventEmitter implements FileMgrPublicInterface {
  private localMgr: LocalClientFileMgr
  private remoteMgr: RemoteClientFileMgr
  constructor (private localUserID: string) {
    super()
    this.localMgr.on(WorkerComm.signal, (dt: {toUser: string, data:any}) => {
      this.emitToRoomCell(this.localUserID, dt.toUser, dt.data)
    })
    this.localMgr.on(WorkerComm.giveData, (dt: {UserID: string, actionID: number}) => {
      this.emit(WorkerComm.giveData, dt)
    })

    this.remoteMgr.on(WorkerComm.signal, (dt: {fromUser: string, toUser: string, data:any}) => {
      this.emitToRoomCell(dt.fromUser, dt.toUser, dt.data)
    })
  }

  private emitToRoomCell (fromUser: string, toUser: string, data: any) {
    this.emit(WorkerComm.signal, { fromUser: fromUser, toUser: toUser, data: data })
  }

  public signal (fromUser: string, toUser: string, data:any) {
    if (toUser === this.localUserID) {
      this.localMgr.signal(fromUser, data)
    } else {
      this.remoteMgr.signal(fromUser, toUser, data)
    }
  }

  public changeLocalUserID (newUserID: string) {
    this.localUserID = newUserID
  }

  public giveWriteFunction (acID: number, func:()=>boolean) {
    this.localMgr.giveWriteFunction(acID, func)
  }

  addRemoteFile (UserID: string, file: FileData): void {
    this.localMgr.addRemoteFile(UserID, file)
  }

  removeRemoteFile (UserID: string, FileID: string): void {
    this.localMgr.removeRemoteFile(UserID, FileID)
  }

  getRemoteFile (UserID: string, FileID: string): FileData|undefined {
    return this.localMgr.getRemoteFile(UserID, FileID)
  }

  getRemoteFileList (UserID: string): FileData[] {
    return this.localMgr.getRemoteFileList(UserID)
  }

  addLocalFile (file: File): FileData {
    return this.localMgr.addFile(file)
  }

  removeLocalFile (FileID: string): void {
    this.localMgr.removeFile(FileID)
  }

  getLocalFile (FileID: string): FileData|undefined {
    return this.localMgr.getFile(FileID)
  }

  getLocalFileList (): FileData[] {
    return this.localMgr.getFileList()
  }

  downloadFile (UserID: string, FileID: string, writableStream:WritableStreamDefaultWriter<any>|WritableStreamForImagesAndStuff): FileDownloadState|undefined {
    return this.localMgr.download(UserID, FileID, writableStream)
  }
}
