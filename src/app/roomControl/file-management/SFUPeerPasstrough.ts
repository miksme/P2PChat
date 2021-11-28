import { FileData } from '../../helpers/fileData'
import { Logger } from '../../helpers/logMsg'
import { WorkerComm } from './fileHelpers'
import { EventEmitter } from 'eventemitter3'
import { WritableStreamForTransfer } from './downloadToStream'
import { DownloaderHandles, PeerFileTransfer, UploaderHandles } from './fileTransfer/withMultiple'
export enum PeerPasstroughEvents {
  signal = 'signal',
  destroy = 'destroy',
  finished = 'finished',
}
class EncodePeerPasstrough {
  public static createDict (downloader: string, uploader: string, data:any, originatesFromFS: boolean) {
    if (originatesFromFS) {
      return { from: uploader, to: downloader, data: data }
    } else {
      return { from: downloader, to: uploader, data: data }
    }
  }
}
/**
 * Creates a 'passtrough' peer from one user to the other.
 * P2P like connection on a SFU server
 */
export class PeerPasstrough extends EventEmitter {
  PeerToFileStream: PeerFileTransfer
  FileStreamToPeer: PeerFileTransfer

  PeerToFileStreamFinished = false
  FileStreamToPeerFinished = false
  /**
   * Init PeerPasstrough
   * @param uploader user who uploads content
   * @param downloader user who downloads content
   * @param fileData data about the file
   * @param maxPeerAmount max amount of peers to allow specified by server
   */
  constructor (private uploader: string, private downloader: string, fileData: FileData, maxPeerAmount: number) {
    super()
    const fstr = new WritableStreamForTransfer()

    this.PeerToFileStream = new PeerFileTransfer(maxPeerAmount, false, fileData, new DownloaderHandles(fstr))// new FileDownloadWithMultipleObject(fstr, filesize, maxPeerAmount, undefined, true);
    this.PeerToFileStream.on(WorkerComm.signal, (data:any) => {
      this.emit(PeerPasstroughEvents.signal, EncodePeerPasstrough.createDict(downloader, uploader, data, false))
    })
    this.PeerToFileStream.on(WorkerComm.finished, (data:{success: boolean}) => {
      this.PeerToFileStreamFinished = true
      this.emit(PeerPasstroughEvents.finished, EncodePeerPasstrough.createDict(downloader, uploader, data.success, false))
      this.checkFinishedState()
    })

    this.FileStreamToPeer = new PeerFileTransfer(maxPeerAmount, true, fileData, new UploaderHandles(fstr))// new FileUploadWithMultipleCObject(fstr, maxPeerAmount);
    this.FileStreamToPeer.on(WorkerComm.signal, (data:any) => {
      this.emit(PeerPasstroughEvents.signal, EncodePeerPasstrough.createDict(downloader, uploader, data, true))
    })
    this.FileStreamToPeer.on(WorkerComm.finished, (data:{success: boolean}) => {
      this.PeerToFileStreamFinished = true
      this.emit(PeerPasstroughEvents.finished, EncodePeerPasstrough.createDict(downloader, uploader, data.success, true))
      this.checkFinishedState()
    })
  }

  private checkFinishedState () {
    if (this.FileStreamToPeerFinished && this.PeerToFileStreamFinished) {
      this.emit(PeerPasstroughEvents.destroy, {})
    }
  }

  signal (source: string, signal: any) {
    if (this.uploader === source) {
      this.PeerToFileStream.signal(signal)
    } else if (this.downloader === source) {
      this.FileStreamToPeer.signal(signal)
    }
  }

  destroy () {
    this.LogMsg('Destroying PeerPasstrough')
    this.PeerToFileStream.cancel()
    this.FileStreamToPeer.cancel()
  }

  private LogMsg (msg: any, level = 3) {
    Logger.Msg('Peer-Passtrough', msg, level)
  }
}
