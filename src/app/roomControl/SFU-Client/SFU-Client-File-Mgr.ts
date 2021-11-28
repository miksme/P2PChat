import { FileMgrEvents } from '../../helpers/FileMgr.enums'
import { LocalClientFileMgr } from './../file-management/localClientFileMgr'
import { FileMgrPublicInterface } from './../../interfaces/FileMgr.public.interface'
import { EventEmitter } from 'eventemitter3'

import { WorkerComm } from './../file-management/fileHelpers'
import { FileDownloadState } from '../file-management/fileDownloadState'
import { WritableStreamForImagesAndStuff } from '../file-management/downloadToDisplay'
import { FileData } from './../../helpers/fileData'

export class SFUClientFileMgr extends EventEmitter implements FileMgrPublicInterface {
  private localMgr: LocalClientFileMgr
  constructor (private localUserID: string) {
    super()
    this.localMgr = new LocalClientFileMgr()
    this.localMgr.on(WorkerComm.signal, (dt: {toUser: string, data:any}) => {
      this.emitToRoomCell(dt.toUser, dt.data)
    })
    this.localMgr.on(WorkerComm.giveData, (dt: {UserID: string, actionID: number}) => {
      this.emit(FileMgrEvents.requestPeerHandle, dt)
    })
  }

  private emitToRoomCell (toUser: string, data: any) {
    this.emit(FileMgrEvents.signal, { toUser: toUser, data: data })
  }

  public signal (fromUser: string, data:any) {
    this.localMgr.signal(fromUser, data)
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
    const a = this.localMgr.addFile(file)
    this.emit(FileMgrEvents.localFileAdded, a)
    return a
  }

  removeLocalFile (FileID: string): void {
    this.localMgr.removeFile(FileID)
    this.emit(FileMgrEvents.localFileRemoved, FileID)
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
