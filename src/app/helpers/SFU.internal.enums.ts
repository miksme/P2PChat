export enum InternalRoomEvents {
  initialId,
  id,
  message,

  newUserInfo,
  newCallInfo,
  newRoomInfo,

  userLost,

  voiceEvent,
  fileEvent
}
export enum InternalVoiceEvents {
  joinCall,
  leaveCall,
  getCall,
  getCallResponse,

  addPossibleStream,
  removePossibleStream,

  getStream,
  removeStream

}
