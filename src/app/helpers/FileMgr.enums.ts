export enum FileMgrEvents {
  localFileAdded = 'localFileAdded',
  localFileRemoved = 'localFileRemoved',

  remoteFileAdded = 'remoteFileAdded',
  remoteFileRemoved = 'remoteFileRemoved',

  signal = 'signal',
  finished = 'finished',
  requestPeerHandle = 'requestPeerHandle'
}
export enum FileMgrSignals {
  downloadFile,
  finished,
  signalPeer,

  uploadChunk,
  ackR,

  error,
  debug
}
export enum TransferType {
  overMain,
  useWorkers
}
export enum FileErrors {
  noSuchFile,
  cancelUpload,
  cancelDownload,
}
