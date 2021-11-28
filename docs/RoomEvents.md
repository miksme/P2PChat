### Events that the "frontend" receives
```ts
  RoomCellPublicEvents.userJoins = ChannelUser
  RoomCellPublicEvents.userLeaves = ChannelUser
  RoomCellPublicEvents.userUpdates = ChannelUser
  RoomCellPublicEvents.userJoinsCall = string
  RoomCellPublicEvents.userLeavesCall = string
  RoomCellPublicEvents.newMessage = MsgData
  RoomCellPublicEvents.userAddsVideoStream = {
    userID: string;
    possibilities: Set<string>;
    primaryStream: string | undefined;
  }
  RoomCellPublicEvents.userRemovesVideoStream = {
    userID: string;
    stream: MediaStream;
  }
  RoomCellPublicEvents.recvVideoStream = {
    userID: string;
    stream: MediaStream;
  }
  RoomCellPublicEvents.remvVideoStream = {
    userID: string;
    streamID: string;
  }
  //Emitted directly to socket mgr so the "frontend" never actually receives it
  RoomCellPublicEvents.signal = {
    source: string;
    target: string;
    room: string;
    signal: any;
  }
```
