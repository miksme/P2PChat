import { MsgData } from '../../helpers/msg'
import Peer from 'simple-peer'
import { ChannelUser } from '../../helpers/user'
import { RoomCellPublicEvents } from '../../helpers/RoomCell.enums'
import { InternalRoomEvents, InternalVoiceEvents } from '../../helpers/SFU.internal.enums'
import { RoomCellInterface } from '../../interfaces/RoomCell.interface'
import { RoomCell } from '../RoomCell.static'

import { SFUClientFileMgr } from './SFU-Client-File-Mgr'
import { SFUClientStreamMgr } from './SFU-Stream-Mgr'

import { FileData } from '../../helpers/fileData'
import { EventEmitter } from 'eventemitter3'
import { JSONparse } from '../../helpers/JSONparse'

import { InternalFileEvents } from '../file-management/fileHelpers'
import { UserConfig } from '../../config/config'
import { FileMgrEvents } from '../../helpers/FileMgr.enums'
import { RoomType } from '../signaling-socket'
class SFUClientHelpers {
  public static makeEncapsulateAll (target: string, idata: any) {
    return { target: target, idata: idata }
  }

  public static makeMsg (msg: string, files: FileData[]) {
    return { msg: msg, files: files }
  }

  public static makeID (user: ChannelUser) {
    return { user: user }
  }

  public static makeInitialID (pwd:string) {
    return { pwd: pwd }
  }

  public static makeNewRoomInfo (name: string, pwd: string, curUsers: number, maxUsers: number) {
    return { name: name, pwd: pwd, curUsers: curUsers, maxUsers: maxUsers }
  }

  public static makeSignal (UserID: string, RoomID: string, signal: any) {
    return { target: UserID, room: RoomID, signal: signal }
  }

  public static makeAddPossibleStream (possibilities: Set<string>, primaryStream?:string) {
    return { possibilities: possibilities, primaryStream: primaryStream }
  }

  public static makeRemovePossibleStream (StreamID: string) {
    return { StreamID: StreamID }
  }

  public static makeGetStream (StreamID: string) {
    return { StreamID: StreamID }
  }

  public static makeRemoveStream (StreamID: string) {
    return { StreamID: StreamID }
  }

  public static makeJoinCall () {
    return {}
  }

  public static makeLeaveCall () {
    return {}
  }

  public static makeGetCallInfo () {
    return {}
  }

  public static makeGetUserInfo () {
    return {}
  }

  public static makeGetRoomInfo () {
    return {}
  }

  public static makeNewPossibleFile (file:FileData) {
    return { file: file }
  }

  public static makeLostPossibleFile (FileID: string) {
    return { FileID: FileID }
  }

  public static makeSignalForMgr (signal: any) {
    return { signal: signal }
  }
}
/**
 * SFUClient-type client.
 * When a new user joins the room, local client will receive all updates through the SFU host.
 * Local client never forms a direct WebRTC connection with the new user.
 */
export class SFUClient extends EventEmitter implements RoomCellInterface {
  // INTERFACE
  roomType = RoomType.SFUClientSide
  externalID = '-1'

  users: Map<string, ChannelUser> = new Map() // Map for frontend to use
  files: SFUClientFileMgr
  call: SFUClientStreamMgr
  // Voice stuff
  isInCall = false

  // Room stuff
  connToServer: { peer: Peer.Instance|undefined, isInit: boolean} = { peer: undefined, isInit: false }

  /*
    General stuff
  */
  constructor (public userID: string, public roomID: string, public roomName: string, public roomPWD: string = '', public roomUserLimit: number, public roomCurrentUser: ChannelUser) {
    super()
    this.externalID = this.userID
    roomCurrentUser.id = 'unknown'
    this.files = new SFUClientFileMgr(this.userID)
    this.call = new SFUClientStreamMgr(this.userID)

    this.files.on(FileMgrEvents.localFileAdded, data => {
      this.sendData(this.makeFileType(InternalFileEvents.newPossibleFile, SFUClientHelpers.makeNewPossibleFile(data)))
    })
    this.files.on(FileMgrEvents.localFileRemoved, data => {
      this.sendData(this.makeFileType(InternalFileEvents.lostPossibleFile, SFUClientHelpers.makeLostPossibleFile(data)))
    })
    this.files.on(FileMgrEvents.signal, (idata:{toUser: string, data: any}) => {
      this.sendData(this.makeFileType(InternalFileEvents.signalForMgr, idata.data), idata.toUser)
    })
    this.files.on(FileMgrEvents.requestPeerHandle, (dt:{UserID: string, actionID: number}) => {
      const a = this.connToServer.peer
      if (a) {
        this.files.giveWriteFunction(dt.actionID, () => {
          if (a) {
            return a.bufferSize < (a.writableHighWaterMark * 0.9)
          } return false
        })
      }
    })

    this.call.on(RoomCellPublicEvents.remvVideoStream, d => {
      this.makeRoomEvent(RoomCellPublicEvents.remvVideoStream, d)
    })
    this.call.on(RoomCellPublicEvents.recvVideoStream, d => {
      this.makeRoomEvent(RoomCellPublicEvents.recvVideoStream, d)
    })
    this.call.on(RoomCellPublicEvents.userAddsVideoStream, d => {
      this.makeRoomEvent(RoomCellPublicEvents.userAddsVideoStream, d)
    })
    this.call.on(RoomCellPublicEvents.userJoinsCall, d => {
      this.makeRoomEvent(RoomCellPublicEvents.userJoinsCall, d)
    })
    this.call.on(RoomCellPublicEvents.userLeavesCall, d => {
      this.makeRoomEvent(RoomCellPublicEvents.userLeavesCall, d)
    })
  }

  destringify (data: string): {source: string, idata:{type: InternalRoomEvents, data:any}} {
    return JSONparse.destringify(data)
  }

  stringify (data: any): string {
    return JSONparse.stringify(data)
  }

  leaveRoom (): void {
    this.connToServer.isInit = false
    this.connToServer.peer?.destroy()
  }

  signal (data: { from: string, signal: any }): void {
    switch (data.signal.type) {
      case 'offer':
        if (this.connToServer.peer) {
          this.connToServer.peer.signal(data.signal)
        } else if (!this.connToServer.isInit) {
          const a = new Peer({ initiator: false, trickle: true, config: UserConfig.getPeerConfig(), stream: new MediaStream() })
          this.createPeerListeners(data.from, a)
          // b.users.set(data.from.ID, {peer: a, isInit:false, initSender:false,renegotiating:false, stream:undefined});
          this.connToServer = { peer: a, isInit: false }
          a.signal(data.signal)
        }
        break
      default:
        if (this.connToServer.peer) {
          // if (data.signal.type === 'renegotiate') { this.connToServer.renegotiating = true };
          this.connToServer.peer.signal(data.signal)
        }
        break
    }
  }

  private createPeerListeners (target: string, peer: Peer.Instance) {
    peer.on('signal', (data) => {
      this.makeSignal(target, data)
    })
    this.createGeneralPeerListeners(target, peer)
  }

  private createGeneralPeerListeners (target: string, peer: Peer.Instance) {
    peer.on('error', err => { RoomCell.LogMsg('Got an error: ' + err) })
    peer.on('close', () => {
      // this.retryConnection()
      RoomCell.LogMsg('Connection to server lost')
      peer.destroy()
    })
    peer.on('connect', () => {
      RoomCell.LogMsg('Connection to server established')
      peer.write(this.stringify(SFUClientHelpers.makeEncapsulateAll(this.userID, this.makeRoomSendable(InternalRoomEvents.initialId, SFUClientHelpers.makeInitialID(this.roomPWD)))))
    })

    peer.on('data', (c) => {
      const recvData:{source: string, idata:{type: InternalRoomEvents, data:any}} = this.destringify(c)
      const fromID = recvData.source
      const d = recvData.idata
      if (fromID !== this.userID) {
        switch (d.type) {
          case InternalRoomEvents.initialId:
            this.connToServer.isInit = true
            this.userID = d.data.id
            this.roomCurrentUser.id = this.userID
            this.files.changeLocalUserID(this.userID)
            this.call.changeID(this.userID)
            this.makeRoomEvent(RoomCellPublicEvents.userUpdates, this.roomCurrentUser)
            this.sendID()
            break
          case InternalRoomEvents.id:
            this.internalRoomIDEvent(fromID, d.data)
            break
          case InternalRoomEvents.newUserInfo:
            {
              const newUsrInfo: ChannelUser[] = d.data
              newUsrInfo.forEach(u => this.addNewChatUser(u))
            }
            break
          case InternalRoomEvents.newRoomInfo:
            {
              const newRoomInfo: {name: string, pwd: string, curUsers: number, maxUsers: number} = d.data
              this.roomName = newRoomInfo.name
              this.roomPWD = newRoomInfo.pwd
              this.roomUserLimit = newRoomInfo.maxUsers
              if (newRoomInfo.curUsers !== (this.users.size - 1)) {
                this.sendData(this.makeRoomSendable(InternalRoomEvents.newUserInfo, SFUClientHelpers.makeGetUserInfo()))
              }
            }
            break
          case InternalRoomEvents.newCallInfo:
            {
              const newCallInfo: Map<string, {possibilities:Set<string>, primaryStream:string|undefined}> = d.data
              newCallInfo.forEach((streamData, userID) => {
                if (userID !== this.userID) {
                  this.call.addRemoteUser(userID)
                  this.call.addRemotePossibilities(userID, streamData.primaryStream, streamData.possibilities)
                }
              })
            }
            break
          case InternalRoomEvents.userLost:
            this.removeClient(d.data)
            break
          case InternalRoomEvents.message:
            this.internalRoomMessageEvent(fromID, d.data)
            break
          case InternalRoomEvents.voiceEvent:
            this.internalRoomVoiceEvent(fromID, d.data)
            break
          case InternalRoomEvents.fileEvent:
            this.internalRoomFileEvent(fromID, d.data)
            break
        }
      }
    })
    peer.on('stream', (stream: MediaStream) => {
      this.call.addRemoteStream(target, stream)
    })
  }

  private sendData (data:any, ID?: string):void {
    if (this.connToServer.isInit) {
      if (ID !== undefined) {
        if (this.users.has(ID)) {
          this.connToServer.peer?.write(this.stringify(SFUClientHelpers.makeEncapsulateAll(ID, data)))
        }
      } else {
        this.connToServer.peer?.write(this.stringify(SFUClientHelpers.makeEncapsulateAll(this.userID, data)))
      }
    }
  }

  private sendID () {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.id, SFUClientHelpers.makeID(this.roomCurrentUser)))
  }

  private makeSignal (to: string, signal: any) {
    this.makeRoomEvent(RoomCellPublicEvents.signal, SFUClientHelpers.makeSignal(to, this.roomID, signal))
  }

  private makeRoomSendable (type: InternalRoomEvents, data:any):{type:InternalRoomEvents, data:any} {
    return { type: type, data: data }
  }

  private makeVoiceType (type: InternalVoiceEvents, data:boolean|unknown|string|{possibilities: Set<string>|undefined, primaryStream: string|undefined}):{type: InternalRoomEvents, data:{type:InternalVoiceEvents, special:any}} {
    return this.makeRoomSendable(InternalRoomEvents.voiceEvent, { type: type, special: data })
  }

  private makeFileType (type: InternalFileEvents, data:any):{type: InternalRoomEvents, data:{type:InternalFileEvents, special:any}} {
    return this.makeRoomSendable(InternalRoomEvents.fileEvent, { type: type, special: data })
  }

  private makeRoomEvent (event: RoomCellPublicEvents, data: any): void {
    this.emit(event, data)
  }

  /**
   * =====================================================
   * Event handles. Do all the actual communication part.
   * =====================================================
   */
  private internalRoomIDEvent (target: string, idata:any) {
    const data:{user:ChannelUser} = idata
    const a = new ChannelUser(data.user.username, target, data.user.avatarLoc)
    const b = this.users.has(target)
    this.users.set(target, a)
    if (b) {
      this.makeRoomEvent(RoomCellPublicEvents.userUpdates, a)
    } else {
      RoomCell.LogMsg('User connected')
      this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
    }
  }

  private internalRoomMessageEvent (target: string, data:any) {
    this.makeRoomEvent(RoomCellPublicEvents.newMessage, new MsgData(data.msg, target, data.files))
  }

  private internalRoomVoiceEvent (target: string, data:{type:InternalVoiceEvents, special:any}) {
    switch (data.type) {
      case InternalVoiceEvents.joinCall:
        // Add to remoteStream sets, emit New User, reply if needed
        RoomCell.LogMsg('Someone joined a call')
        this.call.addRemoteUser(target)
        break
      case InternalVoiceEvents.leaveCall:
        this.call.removeRemoteUser(target)
        break
      case InternalVoiceEvents.addPossibleStream:
        {
          const IncomingData: {possibilities: Set<string>, primaryStream:string} = data.special
          this.call.addRemotePossibilities(target, IncomingData.primaryStream, IncomingData.possibilities)
          if (IncomingData.primaryStream && this.isInCall) { this.requestStream(target, IncomingData.primaryStream) }
        }
        break
      case InternalVoiceEvents.getStream:
        RoomCell.LogMsg('Server asking for a stream')
        this._requestStream(data.special.StreamID)
        break
      case InternalVoiceEvents.removeStream:
        RoomCell.LogMsg('Server asking to remove a stream')
        this._removeStream(data.special.StreamID)
        break
    }
  }

  private internalRoomFileEvent (target: string, data:{type: InternalFileEvents, special:any}) {
    switch (data.type) {
      case InternalFileEvents.newPossibleFile:
        {
          const tdata:FileData = data.special.file
          this.files.addRemoteFile(target, tdata)
          RoomCell.LogMsg(`Got new possbile file: UserID: ${target} FileID: ${tdata.FileID}`)
        }
        break
      case InternalFileEvents.lostPossibleFile:
        this.files.removeRemoteFile(target, data.special.FileID)
        break
      case InternalFileEvents.signalForMgr:
        RoomCell.LogMsg('Got mgr signaling data', 3)
        this.files.signal(target, data.special)
        break
    }
  }

  /**
   Chat stuff
   */

  sendMsg (message: string, files?: FileData[]): void {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.message, SFUClientHelpers.makeMsg(message, files || [])))
  }

  updateUser (user: ChannelUser): void {
    this.roomCurrentUser = user
    this.sendData(this.makeRoomSendable(InternalRoomEvents.id, SFUClientHelpers.makeID(user)))
  }

  private addNewChatUser (user: ChannelUser) {
    const a = new ChannelUser(user.username, user.id, user.avatarLoc)
    const b = this.users.has(user.id)
    this.users.set(user.id, a)
    if (b) {
      this.makeRoomEvent(RoomCellPublicEvents.userUpdates, a)
    } else {
      RoomCell.LogMsg('User connected')
      this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
    }
  }

  private removeChatUser (userID: string) {
    if (this.users.has(userID)) {
      this.call.removeRemoteUser(userID)
      this.makeRoomEvent(RoomCellPublicEvents.userLeaves, userID)
      this.users.delete(userID)
    }
  }

  addUser (UserID: string):void {
    RoomCell.LogMsg(`Attempt was made to add ${UserID}.Users cannot be added in current room configuration`)
  }

  removeClient (UserID: string):void {
    const a = this.users.get(UserID)
    if (a) {
      this.call.removeRemoteUser(UserID)
      this.makeRoomEvent(RoomCellPublicEvents.userLeaves, a)
      this.users.delete(UserID)
    }
  }

  removeUser (UserID: string):void {
    RoomCell.LogMsg(`Lost connection to server (ID: ${UserID})? Doing nothing`)
  }

  /**
 * ============================================
 * All things voice
 * ============================================
 */
  joinCall (audio: boolean, video: boolean): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.isInCall) {
        if ((audio || video) === false) {
          const stream = new MediaStream()
          this.isInCall = true
          this.call.addRemoteUser(this.userID)
          this.call.addLocalStream(stream, true)
          this.call.hasCamOn = false
          this.call.hasMicOn = false
          RoomCell.LogMsg(this.call)
          RoomCell.LogMsg('Current user force joined call - no audio or video')
          this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, SFUClientHelpers.makeJoinCall()))
          this.sendAddPossibleStream()
          resolve(true)
        } else {
          RoomCell.getUsrMedia(audio, video).then(stream => {
            this.isInCall = true
            this.call.addRemoteUser(this.userID)
            this.call.addLocalStream(stream, true)
            this.call.hasCamOn = video
            this.call.hasMicOn = audio
            RoomCell.LogMsg('Current user joined call')
            this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, SFUClientHelpers.makeJoinCall()))
            this.sendAddPossibleStream()
            resolve(true)
          }, er => {
            reject(er)
          })
        }
      } else {
        resolve(false)
      }
    })
  }

  leaveCall (): Promise<void> {
    return new Promise((resolve) => {
      this.sendData(this.makeVoiceType(InternalVoiceEvents.leaveCall, SFUClientHelpers.makeLeaveCall()))

      this.call.getUsedStreams().forEach((streamSet) => {
        const remotePeer = this.connToServer.peer
        if (remotePeer) {
          streamSet.forEach(stream => {
            remotePeer?.removeStream(stream)
          })
        }
      })
      this.call.closeLocalUser()
      this.isInCall = false
      resolve()
    })
  }

  requestStream (UserID: string, VideoSourceID: string) {
    RoomCell.LogMsg('requestStream called ' + UserID + ' ' + VideoSourceID)
    if (this.userID === UserID) {
      this.call.vertifyIfHasLocalStream(VideoSourceID)
    } else {
      if (!this.call.vertifyIfHasRemoteStream(UserID, VideoSourceID)) {
        this.call.requestRemoteStream(UserID, VideoSourceID)
        this.sendData(this.makeVoiceType(InternalVoiceEvents.getStream, SFUClientHelpers.makeGetStream(VideoSourceID)), UserID)
      }
    }
  }

  removeStream (UserID: string, VideoSourceID: string) {
    if (this.call.hasIncoming(UserID, VideoSourceID)) {
      this.sendData(this.makeVoiceType(InternalVoiceEvents.removeStream, SFUClientHelpers.makeRemoveStream(VideoSourceID)), UserID)
    }
  }

  private _requestStream (ID: string) {
    const user = this.connToServer
    const pos = this.call.getLocalStreamForServer(ID)
    if (pos && user.isInit && user.peer) {
      RoomCell.LogMsg('Adding stream')
      user.peer.addStream(pos)
    }
  }

  private _removeStream (ID:string):boolean {
    const pos = this.call.getLocalStream(ID)
    const user = this.connToServer
    if (user.isInit && user.peer && pos) {
      user.peer.removeStream(pos)
      this.call.removeOutgoingForServer(ID)
      return true
    }
    return false
  }

  private _removeLocalStream (ID:string):void {
    const stream = this.call.getLocalStream(ID)
    if (stream) {
      const a = this.call.getOutgoingByStream(ID)
      if (a && a.size > 0) {
        this.connToServer.peer?.removeStream(stream)
      }
      this.call.removeLocalStream(ID)
      const b = this.call.getLocalStreamInfo()
      if (b) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, SFUClientHelpers.makeAddPossibleStream(b.streams, b.primaryStream))) }
    }
  }

  turnOnMicrophone (turnOn: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const a = this.call.getLocalPrimary()
      if (a !== undefined) {
        if (turnOn) {
          if (!this.call.hasMicOn) {
            if (a.getAudioTracks().length === 0) {
              RoomCell.getUsrMedia(true, false).then(stream => {
                if (a) {
                  const c = stream.getAudioTracks()
                  if (c.length !== 0) {
                    c.forEach(track => {
                      a?.addTrack(track)
                    })
                    this.call.hasMicOn = true
                    resolve(true)
                  } else {
                    resolve(false)
                  }
                }
              }, () => {
                resolve(false)
              })
            } else {
              a?.getAudioTracks().forEach(t => { t.enabled = true })
              this.call.hasMicOn = true
              resolve(true)
            }
          } else {
            resolve(false)
          }
        } else {
          a?.getAudioTracks().forEach(t => { t.enabled = false })
          this.call.hasMicOn = false
        }
      } else {
        resolve(false)
      }
    })
  }

  turnOnCamera (turnOn: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const a = this.call.getLocalPrimary()
      if (a) {
        if (turnOn) {
          if (!this.call.hasCamOn) {
            if (a.getVideoTracks().length === 0) {
              RoomCell.getUsrMedia(true, false).then(stream => {
                if (a) {
                  const c = stream.getVideoTracks()
                  if (c.length !== 0) {
                    c.forEach(track => {
                      a?.addTrack(track)
                    })
                    this.call.hasCamOn = true
                    resolve(true)
                  } else {
                    resolve(false)
                  }
                }
              }, () => {
                resolve(false)
              })
            } else {
              a?.getVideoTracks().forEach(t => { t.enabled = true })
              this.call.hasCamOn = true
              resolve(true)
            }
          } else {
            resolve(false)
          }
        } else {
          a?.getVideoTracks().forEach(t => { t.enabled = false })
          this.call.hasCamOn = false
        }
      } else {
        resolve(false)
      }
    })
  }

  screenShareWindow (turnOn: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const a = this.call.getLocalPrimary()
      if (a) {
        if (turnOn) {
          if (!this.call.hasScreenshareOn) {
            RoomCell.getUsrDesktopMedia().then(stream => {
              if (stream.getVideoTracks().length > 0) {
                this.call.hasScreenshareOn = true
                this.call.addLocalStream(stream, false)
                this.sendAddPossibleStream()
                resolve(true)
              } else {
                stream.getTracks().forEach(t => t.stop())
                resolve(false)
              }
            }, () => {
              resolve(false)
            })
          } else {
            resolve(false)
          }
        } else {
          this.call.getLocalStreams()?.forEach((val, key) => {
            if (key !== a?.id) {
              this._removeLocalStream(key)
            }
          })
          this.call.hasScreenshareOn = false
          resolve(true)
        }
      } else {
        resolve(false)
      }
    })
  }

  private sendAddPossibleStream () {
    const a = this.call.getLocalStreamInfo()
    if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, SFUClientHelpers.makeAddPossibleStream(a.streams, a.primaryStream))) }
  }
}
