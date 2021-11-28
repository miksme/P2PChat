### File transfer with PeerFileTransfer
#### Sequence
1. Uploader establishes a peer connection with downloader
2. Both users do a write test on mgr ( `InternalWorkerComm.respondPeerAmount` )
3. Downloader sends transfer information with InternalWorkerComm.chunkData
4. If uploader agrees with provided information it responds with `InternalWorkerComm.suggestPeerAmount` - suggested peer amount
5. Downloader returns its suggestion
6. Upon agreeing they create the agreed amount of peers
7. Once the peers are connected, the downloader starts the download by sending the `InternalWorkerComm.startTransfer` signal
8. Uploader starts sending chunks over created peers
9. Any missing chunks will be requested over mgr ( `InternalWorkerComm.requestChunk` ) and received with `InternalWorkerComm.respondChunk`
#### Types
```txt
InternalWorkerComm.chunkData = {chunkSize: number, fileData: FileData, role:PeerRoles}
InternalWorkerComm.suggestPeerAmount = number
InternalWorkerComm.requestChunk = number
InternalWorkerComm.respondChunk = {chunkID: number, chunk: Uint8Array}
InternalWorkerComm.signal = {peerID: number, signal: any}
InternalWorkerComm.startTransfer = {}
InternalWorkerComm.terminateTransfer = {errored: boolean}
InternalWorkerComm.bufferOverPause = {}
InternalWorkerComm.Resume = {}
InternalWorkerComm.respondPeerAmount = 'test msg'
```
