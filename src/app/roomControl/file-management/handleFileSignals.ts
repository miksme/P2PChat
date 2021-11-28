import { TransferType, FileMgrSignals } from '../../helpers/FileMgr.enums'
import { FileErrors } from './fileHelpers'
import { FileData } from '../../helpers/fileData'
/**
 * "Encodes" a file mgr signal
 */
export class EncodeSignal {
  private static type (type: FileMgrSignals, data:any) {
    return { type: type, idata: data }
  }

  public static finished (sendersAcID: number, receiversAcID: number, success: boolean) {
    return this.type(FileMgrSignals.finished, { sendersAcID: sendersAcID, receiversAcID: receiversAcID, success: success })
  }

  public static downloadFile (FileID: string, ChunkSize: number, type:TransferType, Timeout:number, sendersAcID:number) {
    return this.type(FileMgrSignals.downloadFile, { FileID: FileID, ChunkSize: ChunkSize, type: type, Timeout: Timeout, sendersAcID: sendersAcID })
  }

  public static uploadChunk (sendersAcID: number, ChunkID:number, Chunk:Uint8Array) {
    return this.type(FileMgrSignals.uploadChunk, { sendersAcID: sendersAcID, ChunkID: ChunkID, Chunk: Chunk })
  }

  public static signalPeer (receiversAcID: number, sendersAcID: number, signal:any) {
    return this.type(FileMgrSignals.signalPeer, { receiversAcID: receiversAcID, sendersAcID: sendersAcID, signal: signal })
  }

  public static ackR (receiversAcID: number, sendersAcID: number, type:TransferType) {
    return this.type(FileMgrSignals.ackR, { receiversAcID: receiversAcID, sendersAcID: sendersAcID, type: type })
  }

  public static error (sendersAcID: number, receiversAcID: number, error: FileErrors) {
    return this.type(FileMgrSignals.error, { sendersAcID: sendersAcID, receiversAcID: receiversAcID, error: error })
  }
}
/**
 * "Decodes" a file mgr signal
 */
export class DecodeSignal {
  public static type (data:any):{type: FileMgrSignals, idata:any} {
    return data
  }

  public static finished (data:any):{receiversAcID: number, sendersAcID: number, success: boolean} {
    return data
  }

  public static downloadFile (data:any):{FileID: string, ChunkSize: number, type:TransferType, Timeout:number, sendersAcID:number} {
    return data
  }

  public static uploadChunk (data:any):{sendersAcID: number, ChunkID:number, Chunk:Uint8Array} {
    return data
  }

  public static signalPeer (data:any):{receiversAcID: number, sendersAcID: number, signal:any} {
    return data
  }

  public static ackR (data:any):{receiversAcID: number, sendersAcID: number, type:TransferType} {
    return data
  }

  public static error (data:any):{receiversAcID: number, sendersAcID: number, error: FileErrors} {
    return data
  }
}
/**
 * "Encodes" a file mgr signal for frontend
 */
export class EncodeLocalSignal {
  public static requestPeerHandle (UserID: string, actionID: number) {
    return { UserID: UserID, actionID: actionID }
  }

  public static localFileAdded (fileData: FileData) {
    return fileData
  }

  public static localFileRemoved (FileID: string) {
    return FileID
  }

  public static remoteFileAdded (UserID: string, fileData: FileData) {
    return { UserID: UserID, idata: fileData }
  }

  public static remoteFileRemoved (UserID: string, FileID: string) {
    return { UserID: UserID, idata: FileID }
  }
}
/**
 * "Decodes" a file mgr signal for frontend
 */
export class DecodeLocalSignal {
  public static requestPeerHandle (data:any):{UserID: string, actionID: number} {
    return data
  }

  public static localFileAdded (data:any):FileData {
    return data
  }

  public static localFileRemoved (data:any):string {
    return data
  }

  public static remoteFileAdded (data:any):{UserID: string, idata: FileData} {
    return data
  }

  public static remoteFileRemoved (data:any):{UserID: string, idata: string} {
    return data
  }
}
