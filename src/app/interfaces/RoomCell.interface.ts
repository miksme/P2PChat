import { RoomType } from 'src/app/roomControl/signaling-socket'
import { StreamMgrPublicInterface } from './StreamMgr.public.interface'
import { FileMgrPublicInterface } from './FileMgr.public.interface'
import { MsgData } from '../helpers/msg'
import { FileData } from '../helpers/fileData'
import { ChannelUser } from '../helpers/user'
import { RoomCellPublicEvents } from '../helpers/RoomCell.enums'
export interface RoomCellInterface {

  externalID: string// ID of this user on the signaling server
  userID: string // ID of this user
  roomType: RoomType;// Type of room this is
  roomID: string // ID of this room
  roomPWD: string // Password of this room
  roomName: string // Name of the room
  roomUserLimit: number // Rooms user limit
  roomCurrentUser: ChannelUser // Setup of frontend user

  users: Map<string, ChannelUser> // Map for frontend to use
// private internalUsers: Map<string, any> //Where DataConf is left for architecture type to create, for internal use only

/**
 * File manager for the room. Frontend can directly interact trough FileMgrPublicInterface
 */
  files: FileMgrPublicInterface;
  call: StreamMgrPublicInterface;

  leaveRoom(): void // Destroys all connections, terminates self

  signal(data: { from: string, signal: any }): void // Pass signaling data to the server

  sendMsg(message: string, files?:FileData[]): void // Sends a message to all users

  updateUser(user: ChannelUser): void // Sends updated data (nickname) to other users

  /**
   * Adds a 'new' user to the room. Stars the signalings process
   * @param UserID ID of user
   */
  addUser(UserID: string):void;
  /**
   * Removes a user from the room
   * @param UserID ID of user
   */
  removeUser(UserID: string):void;

  joinCall(audio: boolean, video: boolean): Promise<boolean> // Joins or starts a call in the room with specified settings. returns false if settings were decliened
  leaveCall(): Promise<void> // Leaves the call user was part of.
  /**
   * Requests remote video stream
   * @param UserID ID of user
   * @param VideoSourceID ID of video stream
   */
  requestStream(UserID: string, VideoSourceID: string):void
  /**
   * Requests to stop a remote video stream
   * @param UserID ID of user
   * @param VideoSourceID ID of video stream
   */
  removeStream(UserID: string, VideoSourceID: string):void

  turnOnMicrophone(turnOn: boolean): Promise<boolean> // Enables or disables the microphone
  turnOnCamera(turnOn: boolean): Promise<boolean> // Enables or disables the camera
  screenShareWindow(turnOn: boolean): Promise<boolean> // Trys to screenshare, if success then promise returns true else false, if was already screensharing terminates share and returns true

  // Events ***only*** for frontend

  on(event: RoomCellPublicEvents.userJoins, fn: (data:ChannelUser) => void): void // new user data
  on(event: RoomCellPublicEvents.userLeaves, fn: (data:ChannelUser) => void): void // user leaves (use from memory)
  on(event: RoomCellPublicEvents.userUpdates, fn: (data:ChannelUser) => void): void // updated user data, UserID is unchanged

  on(event: RoomCellPublicEvents.userJoinsCall, fn: (data:string) => void): void // new user joins a call
  on(event: RoomCellPublicEvents.userLeavesCall, fn: (data:string) => void): void // new user joins a call

  on(event: RoomCellPublicEvents.newMessage, fn: (data:MsgData) => void): void // new message to display, sent files should also use this

  on(event: RoomCellPublicEvents.signal, fn: (data:{source:string, target:string, room:string, signal:any}) => void): void // new message to display, sent files should also use this

  on(event: RoomCellPublicEvents.userAddsVideoStream, fn: (data:{UserID: string, Possibilities: Set<string>}) => void): void // data about new video stream
  on(event: RoomCellPublicEvents.userRemovesVideoStream, fn: (data:{UserID: string, VideoSourceID: string}) => void): void // data about now destroyed video stream

  on(event: RoomCellPublicEvents.recvVideoStream, fn: (data:{UserID: string, VideoSourceID: string}) => void): void // data about received video stream
  on(event: RoomCellPublicEvents.remvVideoStream, fn: (data:{UserID: string, VideoSourceID: string}) => void): void // data about removed video stream

}
