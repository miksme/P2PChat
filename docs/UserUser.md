### Data that the local user receives from others and sends itself
#### General
```txt
  InternalRoomEvents.initialId = {id: string}
  InternalRoomEvents.id = {user:ChannelUser, pwd: string, init:boolean}
  InternalRoomEvents.message = MsgData
  InternalRoomEvents.newUserInfo = ChannelUser[]
  InternalRoomEvents.newCallInfo = Map<string, {possibilities:Set<string>, primaryStream:string|undefined}>
  InternalRoomEvents.newRoomInfo = {name: string, pwd: string, curUsers: number, maxUsers: number}
  InternalRoomEvents.userLost = string
  InternalRoomEvents.voiceEvent = {type:InternalVoiceEvents, special:any}
  InternalRoomEvents.fileEvent = {type: InternalFileEvents, special:any}
```
#### Voice types
```txt
  InternalVoiceEvents.joinCall = string
  InternalVoiceEvents.leaveCall = string
  InternalVoiceEvents.addPossibleStream = {possibilities: Set<string>, primaryStream:string}
  InternalVoiceEvents.getStream = {StreamID: string}
  InternalVoiceEvents.removeStream = {StreamID: string}
```
#### File types
```txt
  InternalFileEvents.newPossibleFile = {file: FileData}
  InternalFileEvents.lostPossibleFile = {FileID: string}
  InternalFileEvents.signalForMgr = {type:FileMgrSignals, idata:any}
```
#### File mgr signals
```txt
  FileMgrSignals.downloadFile = {
    FileID: string;
    ChunkSize: number;
    type: TransferType;
    Timeout: number;
    sendersAcID: number;
  }
  FileMgrSignals.ackR = {
    receiversAcID: number;
    sendersAcID: number;
    type: TransferType;
  }
  FileMgrSignals.uploadChunk = {
    sendersAcID: number;
    ChunkID: number;
    Chunk: Uint8Array;
  }
  FileMgrSignals.signalPeer = {
    receiversAcID: number;
    sendersAcID: number;
    signal: any;
  }
  FileMgrSignals.finished = {
    receiversAcID: number;
    sendersAcID: number;
    success: boolean;
  }
  FileMgrSignals.error = {
    receiversAcID: number;
    sendersAcID: number;
    error: FileErrors;
  }
```
