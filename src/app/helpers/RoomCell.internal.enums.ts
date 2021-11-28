
export enum InternalRoomEvents {
  id,
  message,

  voiceEvent,
  fileEvent
}
export enum InternalVoiceEvents {
  joinCall,
  leaveCall,

  addPossibleStream,
  removePossibleStream,

  getStream,
  removeStream

}
