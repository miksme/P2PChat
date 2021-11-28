export enum FileEvents {
  newPossibleFile = 'newPossibleFile',
  lostPossibleFile = 'lostPossibleFile',

  downloadFinished = 'downloadFinished',

  error ='error'
}
export enum DownloadType {
  overMain,
  useWorkers
}
export enum InternalFileEvents {
  newPossibleFile,
  lostPossibleFile,

  downloadFile,
  uploadFile,

  signalForMgr,

  error,
  ackR
}
export enum FileErrors {
  noSuchFile = 'noSuchFile',
  cancel = 'cancel',
  cancelUpload = 'cancelUpload',
  cancelDownload = 'cancelDownload',
}
export enum FileMgrOutputs {
  finished,
  finishedUpload,
  startDownload,
  uploadChunk,
  signalForMgr,
  ackR,

  sendError
}
export enum FileFuncOutput {

}

export interface IFileUploadChunk{
  (ChunkID: number, Chunk: Uint8Array): void;
}
export interface IFileUpload{
  cancel():void;
  startUpload():void;
}

export interface IFileDownload{
  addChunk(ChunkID:number, Chunk: Uint8Array):void;
  cancel():void;
}
export interface IFileFinished{
  (successful: boolean): void;
}
export enum WorkerComm {
  signal = 'signal',
  abort = 'abort',
  giveData='giveData',
  finished='finished',
  logmessage='logmessage'
}
export enum InternalWorkerComm {
  suggestPeerAmount,
  respondPeerAmount,

  startTransfer,
  terminateTransfer,

  signal,
  chunkData,

  requestChunk,
  respondChunk,

  bufferOverPause,
  Resume,

}
