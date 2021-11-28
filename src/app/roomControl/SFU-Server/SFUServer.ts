import { RoomType } from 'src/app/roomControl/signaling-socket'

import { MsgData } from '../../helpers/msg'
import Peer from 'simple-peer'
import { ChannelUser } from '../../helpers/user'

import { RoomCellPublicEvents } from '../../helpers/RoomCell.enums'
import { InternalRoomEvents, InternalVoiceEvents } from '../../helpers/SFU.internal.enums'
import { RoomCellInterface } from '../../interfaces/RoomCell.interface'
import { RoomCell } from '../RoomCell.static'

import { SFUServerFileMgr } from './SFU-Server-File-Mgr'
import { SFUServerStreamMgr } from './SFU-Stream-Mgr'

import { FileData } from '../../helpers/fileData'
import { EventEmitter } from 'eventemitter3'
import { JSONparse } from '../../helpers/JSONparse'

import { InternalFileEvents } from '../file-management/fileHelpers'
import { UserConfig } from '../../config/config'
import { FileMgrEvents } from '../../helpers/FileMgr.enums'
class SFUServerHelpers {
  public static makeEncapsulateAll (source: string, idata: any) {
    return { source: source, idata: idata }
  }

  public static makeMsg (msg: string, files: FileData[]) {
    return { msg: msg, files: files }
  }

  public static makeID (user: ChannelUser) {
    return { user: user }
  }

  public static makeInitialID (id:string) {
    return { id: id }
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

  public static makeGiveCallInfo (data: Map<string, {possibilities:Set<string>, primaryStream:string|undefined}>) {
    return data
  }

  public static makeGiveUserInfo (users: ChannelUser[]) {
    return users
  }

  public static makeUserLost (userID: string) {
    return userID
  }

  public static makeGiveRoomInfo (data: {name: string, pwd: string, curUsers: number, maxUsers: number}) {
    return data
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
 * SFUServer-type client.
 * When a new user joins the room, local client will form a direct WebRTC connection with it and then inform all other connected users about the new user
 */
export class SFUServer extends EventEmitter implements RoomCellInterface {
  // INTERFACE
  roomType = RoomType.SFUServerSide
  externalID = '-1'

  users: Map<string, ChannelUser> = new Map() // Map for frontend to use
  files: SFUServerFileMgr
  call: SFUServerStreamMgr
  // Voice stuff
  isInCall = false

  // Room stuff
  internalUsers: Map<string, { peer: Peer.Instance, isInit: boolean, initExchangeState: number, externalID: string}> = new Map()
  serverID = '-1'
  /*
    General stuff
  */
  constructor (public userID: string, public roomID: string, public roomName: string, public roomPWD: string = '', public roomUserLimit: number, public roomCurrentUser: ChannelUser) {
    super()
    this.externalID = this.userID
    this.userID = '0'
    this.roomCurrentUser.id = '0'
    // TODO
    this.call = new SFUServerStreamMgr(this.userID)
    this.files = new SFUServerFileMgr(this.userID)

    this.files.on(FileMgrEvents.localFileAdded, data => {
      this.sendData(this.makeFileType(InternalFileEvents.newPossibleFile, SFUServerHelpers.makeNewPossibleFile(data)), this.userID)
    })
    this.files.on(FileMgrEvents.localFileRemoved, data => {
      this.sendData(this.makeFileType(InternalFileEvents.lostPossibleFile, data), data)
    })
    this.files.on(FileMgrEvents.signal, (idata:{fromUser:string, toUser: string, data: any}) => {
      this.sendData(this.makeFileType(InternalFileEvents.signalForMgr, idata.data), idata.fromUser, idata.toUser)
    })
    this.files.on(FileMgrEvents.requestPeerHandle, (dt:{UserID: string, actionID: number}) => {
      const a = this.internalUsers.get(dt.UserID)?.peer
      if (a) {
        this.files.giveWriteFunction(dt.actionID, () => {
          if (a) {
            return a.bufferSize < (a.writableHighWaterMark * 0.9)
          } return false
        })
      }
    })

    this.makeRoomEvent(RoomCellPublicEvents.userUpdates, this.roomCurrentUser)

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

  destringify (data: string): {target: string, idata:{ type: InternalRoomEvents, data: any }} {
    return JSONparse.destringify(data)
  }

  stringify (data: any): string {
    return JSONparse.stringify(data)
  }

  /**
   * Called by RoomMgr after response from server.
   * Shoudnt be called directly
   * @param data New info for server
   */
  updateRoom (data:{ID:string, pwd: string, name:string, maxUsers:number, type: RoomType, special: undefined|string}):void {
    this.roomName = data.name
    this.roomPWD = data.pwd
    this.roomUserLimit = data.maxUsers
    this.sendData(this.makeRoomSendable(InternalRoomEvents.newRoomInfo,
      SFUServerHelpers.makeGiveRoomInfo({ name: this.roomName, pwd: this.roomPWD, curUsers: this.internalUsers.size + 1, maxUsers: this.roomUserLimit })),
    this.serverID
    )
  }

  leaveRoom (): void {
    this.internalUsers.forEach(usr => {
      usr.isInit = false
      usr.initExchangeState = 0
      usr.peer.destroy()
    })
  }

  signal (data: { from: string, signal: any }): void {
    const b = this.externalToInternalID.get(data.from)
    if (b) {
      const a = this.internalUsers.get(b)?.peer
      if (a) {
        a.signal(data.signal)
      }
    }
  }

  private lUsedId = 0
  private getNextUserID () {
    this.lUsedId += 1
    return this.lUsedId.toString()
  }

  private createPeerListeners (target: string, internalTarget: string, peer: Peer.Instance) {
    peer.on('signal', (data) => {
      switch (data.type) {
        case 'renegotiate':
          RoomCell.LogMsg('Emitting renegotiate')
          break
      }
      this.makeSignal(target, data)
    })
    this.createGeneralPeerListeners(internalTarget, peer)
  }

  private removeClient (UserID: string) {
    const client = this.internalUsers.get(UserID)
    if (client) {
      RoomCell.LogMsg(`${UserID} force removed`)
      client.peer.destroy()
      this.externalToInternalID.delete(client.externalID)
      const a = this.users.get(UserID)
      if (a) {
        this.sendData(this.makeVoiceType(InternalVoiceEvents.leaveCall, SFUServerHelpers.makeLeaveCall()), UserID)

        this.call.getProvidedStreams(UserID)?.forEach((streams, user) => {
          if (user !== this.userID) {
            const peer = this.internalUsers.get(user)?.peer
            if (peer !== undefined) {
              streams.forEach(st => {
                peer?.removeStream(st)
              })
            }
          }
        })
        this.call.removeRemoteUser(UserID)
        this.makeRoomEvent(RoomCellPublicEvents.userLeaves, a)
        this.users.delete(UserID)
        this.internalUsers.delete(UserID)
        this.sendData(this.makeRoomSendable(InternalRoomEvents.userLost, SFUServerHelpers.makeUserLost(UserID)), this.serverID)
      }
    }
  }

  private createGeneralPeerListeners (target: string, peer: Peer.Instance) {
    peer.on('error', err => { RoomCell.LogMsg('Got an error: ' + err) })
    peer.on('close', () => {
      // TODO this.retryConnection()
      RoomCell.LogMsg(`Connection to ${target} lost`)
      this.removeClient(target)
    })
    /**
     * Don't do anything on a new connection. Client must send password first...
    */
    peer.on('connect', () => {
      RoomCell.LogMsg('New user connected - ' + target)
    })

    peer.on('data', (c) => {
      const receivedData: {target: string, idata:{type: InternalRoomEvents, data:any}} = this.destringify(c)
      const targetID = receivedData.target
      const d = receivedData.idata
      // let d: {type: InternalRoomEvents, data: {source: string, idata:{type: number, data:any}}} = this.destringify(c);
      const a = this.internalUsers.get(target)
      if (a) {
        if (!a.isInit) {
          if (a.initExchangeState === 0) {
            if (d.type === InternalRoomEvents.initialId) {
              const initialIdData: {pwd: string} = d.data
              if (initialIdData.pwd === this.roomPWD) {
                RoomCell.LogMsg(`Vertifiying ${target}`, 2)
                a.initExchangeState = 1
                peer.write(this.stringify(SFUServerHelpers.makeEncapsulateAll(this.userID, this.makeRoomSendable(InternalRoomEvents.initialId, SFUServerHelpers.makeInitialID(target)))))
              } else {
                this.removeClient(target)
              }
            } else {
              this.removeClient(target)
            }
          } else if (a.initExchangeState === 1) {
            if (d.type === InternalRoomEvents.id) {
              RoomCell.LogMsg(`Sending ID to ${target}`, 2)
              this.internalRoomIDEvent(target, targetID, d.data)
            }
          }
        } else {
          switch (d.type) {
            case InternalRoomEvents.id:
              this.internalRoomIDEvent(target, targetID, d.data)
              break
            case InternalRoomEvents.newUserInfo:
              this.internalUserInfoEvent(target)
              break
            case InternalRoomEvents.newRoomInfo:
              this.internalRoomInfoEvent(target)
              break
            case InternalRoomEvents.newCallInfo:
              this.internalVoiceInfoEvent(target)
              break
            case InternalRoomEvents.message:
              this.sendData(d, target)
              this.internalRoomMessageEvent(target, targetID, d.data)
              break
            case InternalRoomEvents.voiceEvent:
              this.internalRoomVoiceEvent(target, targetID, d.data)
              break
            case InternalRoomEvents.fileEvent:
              this.internalRoomFileEvent(target, targetID, d.data)
              break
          }
        }
      }
    })
    peer.on('stream', (stream: MediaStream) => {
      const users = this.call.addRemoteStream(target, stream)
      users?.forEach(usr => {
        const b = this.internalUsers.get(usr)
        if (b?.peer && b.isInit) {
          b.peer.addStream(stream)
        }
      })
      RoomCell.LogMsg(`Got stream from user ${target}`)
    })
  }

  private sendData (data:any, fromID:string, toID?: string):void {
    if (toID && toID !== '') {
      const a = this.internalUsers.get(toID)
      if (a?.isInit) {
        a.peer.write(this.stringify(SFUServerHelpers.makeEncapsulateAll(fromID, data)))
      }
    } else {
      this.internalUsers.forEach((usr, key) => {
        if (usr.isInit && key !== fromID) {
          usr.peer.write(this.stringify(SFUServerHelpers.makeEncapsulateAll(fromID, data)))
        }
      })
    }
  }

  private makeSignal (to: string, signal: any) {
    this.makeRoomEvent(RoomCellPublicEvents.signal, SFUServerHelpers.makeSignal(to, this.roomID, signal))
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
  private internalRoomIDEvent (source: string, target: string, idata:any) {
    const c = this.internalUsers.get(source)
    if (c) {
      const data:{user:ChannelUser} = idata
      const a = new ChannelUser(data.user.username, source, data.user.avatarLoc)
      const b = this.users.has(source)
      this.users.set(source, a)
      if (b) {
        this.makeRoomEvent(RoomCellPublicEvents.userUpdates, a)
      } else {
        c.isInit = true
        RoomCell.LogMsg('User connected')
        this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
        this.internalUserInfoEvent(source)
        this.internalRoomInfoEvent(source)
        this.internalVoiceInfoEvent(source)
      }
      this.sendData(this.makeRoomSendable(InternalRoomEvents.id, SFUServerHelpers.makeID(a)), source)
    }
  }

  private internalRoomInfoEvent (source: string) {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.newRoomInfo, SFUServerHelpers.makeGiveRoomInfo(
      { name: this.roomName, pwd: this.roomPWD, curUsers: this.users.size + 1, maxUsers: this.roomUserLimit }
    )), this.serverID, source)
  }

  private internalUserInfoEvent (source: string) {
    this.createAndSendUserInfo(this.serverID, source)
  }

  private createAndSendUserInfo (from: string, to?:string) {
    // Do not even care that there are way better solutions
    const ar = []
    this.users.forEach((usr, key) => {
      if (key !== to) {
        ar.push(usr)
      }
    })
    ar.push(this.roomCurrentUser)
    this.sendData(this.makeRoomSendable(InternalRoomEvents.newUserInfo, SFUServerHelpers.makeGiveUserInfo(ar)), from, to)
  }

  private internalVoiceInfoEvent (source: string) {
    // Do not even care that there are way better solutions
    const a = this.call.getRemoteStreamInfos()
    if (a !== undefined) {
      const b: Map<string, {possibilities: Set<string>, primaryStream: string|undefined}> = new Map()
      a.forEach((val, key) => {
        b.set(key, { possibilities: val.streams, primaryStream: val.primaryStream })
      })
      this.sendData(this.makeRoomSendable(InternalRoomEvents.newCallInfo, SFUServerHelpers.makeGiveCallInfo(b)), this.serverID, source)
    }
  }

  private internalRoomMessageEvent (source: string, target: string, data:any) {
    this.makeRoomEvent(RoomCellPublicEvents.newMessage, new MsgData(data.msg, source, data.files))
  }

  private internalRoomVoiceEvent (source: string, target: string, data:{type:InternalVoiceEvents, special:any}) {
    switch (data.type) {
      case InternalVoiceEvents.joinCall:
        {
          const success = this.call.addRemoteUser(source)
          if (success) {
            this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, true), source)
            this.internalVoiceInfoEvent(source)
          }
        }
        break
      case InternalVoiceEvents.leaveCall:
        this.sendData(this.makeVoiceType(InternalVoiceEvents.leaveCall, SFUServerHelpers.makeLeaveCall()), source)
        this.call.getProvidedStreams(source).forEach((streams, usr) => {
          const peer = this.internalUsers.get(usr)?.peer
          if (peer) {
            streams.forEach(st => {
              peer?.removeStream(st)
            })
          }
        })
        this.call.removeRemoteUser(source)
        break
      case InternalVoiceEvents.addPossibleStream:
        {
          const IncomingData: {possibilities: Set<string>, primaryStream:string} = data.special
          this.call.addRemotePossibilities(source, IncomingData.primaryStream, IncomingData.possibilities)
          const a = this.call.getRemoteStreamInfo(source)
          if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, SFUServerHelpers.makeAddPossibleStream(a.streams, a.primaryStream)), source) }
          if (IncomingData.primaryStream) { this.requestStream(target, IncomingData.primaryStream) }
        }
        break
      case InternalVoiceEvents.removePossibleStream:
        break
      case InternalVoiceEvents.getStream:
        this._requestStream(source, target, data.special.StreamID)
        break
      case InternalVoiceEvents.removeStream:
        this._removeStream(source, target, data.special.StreamID)
        break
    }
  }

  private internalRoomFileEvent (source: string, target: string, data:{type: InternalFileEvents, special:any}) {
    switch (data.type) {
      case InternalFileEvents.newPossibleFile:
        {
          const tdata:FileData = data.special.file
          console.log(data)
          RoomCell.LogMsg(`Got new possbile file: UserID: ${source} FileID: ${tdata.FileID}`)
          this.files.addRemoteFile(source, tdata)
          this.sendData(this.makeFileType(InternalFileEvents.newPossibleFile, SFUServerHelpers.makeNewPossibleFile(tdata)), source)
        }
        break
      case InternalFileEvents.lostPossibleFile:
        this.files.removeRemoteFile(source, data.special.FileID)
        this.sendData(this.makeFileType(InternalFileEvents.lostPossibleFile, SFUServerHelpers.makeLostPossibleFile(data.special.FileID)), source)
        break
      case InternalFileEvents.signalForMgr:
        RoomCell.LogMsg('Got mgr signaling data', 3)
        this.files.signal(source, target, data.special)
        break
    }
  }

  /**
   Chat stuff
   */

  sendMsg (message: string, files?: FileData[]): void {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.message, SFUServerHelpers.makeMsg(message, files || [])), this.userID)
  }

  updateUser (user: ChannelUser): void {
    this.roomCurrentUser = user
    this.sendData(this.makeRoomSendable(InternalRoomEvents.id, SFUServerHelpers.makeID(user)), this.userID)
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

  private externalToInternalID: Map<string, string> = new Map()
  addUser (UserID: string):void {
    if (!this.externalToInternalID.has(UserID)) {
      RoomCell.LogMsg('Registering a new user')
      const internalID = this.getNextUserID()
      this.externalToInternalID.set(UserID, internalID)
      const a = new Peer({ initiator: true, trickle: true, config: UserConfig.getPeerConfig(), stream: new MediaStream() })
      this.createPeerListeners(UserID, internalID, a)
      this.internalUsers.set(internalID, { peer: a, isInit: false, initExchangeState: 0, externalID: UserID })
    } else {
      RoomCell.LogMsg('User with external ID already exists')
    }
  }

  removeUser (UserID: string):void {
    RoomCell.LogMsg(`Web server asking to remove ${UserID} with local ID of ${this.externalToInternalID.get(UserID)}`)
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
          this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, SFUServerHelpers.makeJoinCall()), this.userID)
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
            this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, SFUServerHelpers.makeJoinCall()), this.userID)
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
      this.sendData(this.makeVoiceType(InternalVoiceEvents.leaveCall, SFUServerHelpers.makeLeaveCall()), this.userID)

      this.call.getUsedStreams().forEach((streamSet, user) => {
        const remotePeer = this.internalUsers.get(user)?.peer
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
        this.call.requestRemoteStream(this.userID, VideoSourceID)
        this.sendData(this.makeVoiceType(InternalVoiceEvents.getStream, SFUServerHelpers.makeGetStream(VideoSourceID)), this.serverID, UserID)
      }
    }
  }

  /**
   * "Public facing" function - does not actually remove a stream if other users are using it, only emits the event that stream has been lost
   * @param UserID ID of user
   * @param VideoSourceID ID of stream
   */
  removeStream (UserID: string, VideoSourceID: string) {
    if (this.call.removeStreamConnection(this.userID, UserID, VideoSourceID) === 0) {
      this.sendData(this.makeVoiceType(InternalVoiceEvents.removeStream, SFUServerHelpers.makeRemoveStream(VideoSourceID)), UserID)
    }
  }

  /**
   * Stream requests from users are passed to here. Adds stream to peer if cache has one otherwise attempts to get the new stream.
   * Local user is never checked since cache will always have all local user streams
   * @param source Who asked for the stream
   * @param target Who has the stream
   * @param StreamID Stream ID
   */
  private _requestStream (source: string, target: string, StreamID: string) {
    const stream = this.call.getStreamForUser(source, target, StreamID)
    if (stream !== undefined) {
      const peer = this.internalUsers.get(source)?.peer
      if (peer) {
        peer.addStream(stream)
      }
    } else {
      if (this.call.getRemoteStreamInfo(target)?.streams.has(StreamID)) {
        this.call.requestRemoteStream(source, StreamID)
        this.sendData(this.makeVoiceType(InternalVoiceEvents.getStream, SFUServerHelpers.makeGetStream(StreamID)), this.serverID, target)
      } else {
        this.internalVoiceInfoEvent(source)
      }
    }
  }

  private _removeStream (source: string, target: string, StreamID:string):boolean {
    const a = this.call.getRemoteStream(target, StreamID)
    const b = this.call.hasConnection(source, target, StreamID)
    if (a && b) {
      this.internalUsers.get(source)?.peer.removeStream(a)
      if (this.call.removeStreamConnection(source, target, StreamID) === 0) {
        this.sendData(this.makeVoiceType(InternalVoiceEvents.removeStream, SFUServerHelpers.makeRemoveStream(StreamID)), target)
      }
      return true
    }
    return false
  }

  private _removeLocalStream (StreamID:string):void {
    const stream = this.call.getLocalStream(StreamID)
    if (stream) {
      const a = this.call.getOutgoingByStream(StreamID)
      if (a && a.size > 0) {
        a.forEach(usr => {
          const user = this.internalUsers.get(usr)
          if (user && user.isInit && user.peer && stream) {
            user.peer.removeStream(stream)
            // a.getTracks().forEach( t => t.stop());
          }
        })
      }
      this.call.removeLocalStream(StreamID)
      this.sendAddPossibleStream()
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
    if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, SFUServerHelpers.makeAddPossibleStream(a.streams, a.primaryStream)), this.userID) }
  }
}
