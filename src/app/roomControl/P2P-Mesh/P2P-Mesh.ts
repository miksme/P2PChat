import { RoomCell } from './../RoomCell.static'
import { RoomType } from 'src/app/roomControl/signaling-socket'

import { MsgData } from './../../helpers/msg'
import Peer from 'simple-peer'
import { ChannelUser } from './../../helpers/user'

import { RoomCellPublicEvents } from '../../helpers/RoomCell.enums'
import { InternalRoomEvents, InternalVoiceEvents } from '../../helpers/RoomCell.internal.enums'
import { RoomCellInterface } from '../../interfaces/RoomCell.interface'

import { P2PFileMgr } from './P2P-File-Mgr'
import { P2PStreamMgr } from './P2P-Stream-Mgr'

import { FileData } from '../../helpers/fileData'
import { EventEmitter } from 'eventemitter3'
import { JSONparse } from '../../helpers/JSONparse'

import { InternalFileEvents } from '../file-management/fileHelpers'
import { UserConfig } from '../../config/config'
import { FileMgrEvents } from '../../helpers/FileMgr.enums'

class P2PMeshHelpers {
  public static makeSignal (UserID: string, RoomID: string, signal: any) {
    return { target: UserID, room: RoomID, signal: signal }
  }

  public static makeID (user: ChannelUser, pwd: string, initial: boolean) {
    return { user: user, pwd: pwd, init: initial }
  }

  public static makeMsg (msg: string, files: FileData[]) {
    return { msg: msg, files: files }
  }

  public static makeJoinCall (isInitial: boolean) {
    return !isInitial
  }

  public static makeLeaveCall () {
    return {}
  }

  public static makeAddPossibleStream (possibilities: Set<string>, primaryStream?:string) {
    return { possibilities: possibilities, primaryStream: primaryStream }
  }

  public static makeRemotePossibleStream (StreamID: string) {
    return StreamID
  }

  public static makeGetStream (StreamID: string) {
    return StreamID
  }

  public static makeRemoveStream (StreamID: string) {
    return StreamID
  }

  public static makeNewPossibleFile (file:FileData) {
    return file
  }

  public static makeLostPossibleFile (FileID: string) {
    return { FileID: FileID }
  }

  public static makeSignalForMgr (signal: any) {
    return signal
  }
}
/**
 * P2P-type client.
 * When a new user joins the room, local client will attempt to create a direct WebRTC connection
 */
export class P2PMesh extends EventEmitter implements RoomCellInterface {
  // INTERFACE
  roomType = RoomType.P2PMesh
  externalID = '-1'

  users: Map<string, ChannelUser> = new Map() // Map for frontend to use
  files: P2PFileMgr
  call: P2PStreamMgr
  // Voice stuff
  isInCall = false

  // Room stuff
  internalUsers: Map<string, { peer: Peer.Instance, isInit: boolean, initSender: boolean, renegotiating: boolean}> = new Map()

  /*
    General stuff
  */
  constructor (public userID: string, public roomID: string, public roomName: string, public roomPWD: string = '', public roomUserLimit: number, public roomCurrentUser: ChannelUser) {
    super()
    this.externalID = this.userID
    this.files = new P2PFileMgr(this.userID)
    this.call = new P2PStreamMgr(this.userID)
    this.files.on(FileMgrEvents.localFileAdded, data => {
      this.sendData(this.makeFileType(InternalFileEvents.newPossibleFile, data))
    })
    this.files.on(FileMgrEvents.localFileRemoved, data => {
      this.sendData(this.makeFileType(InternalFileEvents.lostPossibleFile, data))
    })
    this.files.on(FileMgrEvents.signal, (idata:{toUser: string, data: any}) => {
      this.sendData(this.makeFileType(InternalFileEvents.signalForMgr, idata.data), idata.toUser)
    })
    this.files.on(FileMgrEvents.requestPeerHandle, (dt:{UserID: string, actionID: number}) => {
      const a = this.internalUsers.get(dt.UserID)?.peer
      if (a) {
        this.files.giveWriteFunction(dt.actionID, () => {
          if (a) {
            return a.bufferSize < a.writableHighWaterMark
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

  destringify (data: string): { type: InternalRoomEvents, data: any } {
    return JSONparse.destringify(data)
  }

  stringify (data: any): string {
    return JSONparse.stringify(data)
  }

  leaveRoom (): void {
    this.internalUsers.forEach(usr => {
      usr.isInit = false
      usr.peer.destroy()
    })
  }

  signal (data: { from: string, signal: any }): void {
    switch (data.signal.type) {
      case 'offer':
        {
          const c = this.internalUsers.get(data.from)
          if (c?.renegotiating) {
            c.peer.signal(data.signal)
          } else if (!c) {
            const a = new Peer({ initiator: false, trickle: true, config: UserConfig.getPeerConfig(), stream: new MediaStream() })
            this.createPeerListeners(data.from, a, false)
            // b.users.set(data.from.ID, {peer: a, isInit:false, initSender:false,renegotiating:false, stream:undefined});
            this.internalUsers.set(data.from, { peer: a, isInit: false, initSender: false, renegotiating: false })
            a.signal(data.signal)
          }
        }

        break
      default:
        {
          const a = this.internalUsers.get(data.from)
          if (a) {
            if (data.signal.type === 'renegotiate') { a.renegotiating = true }
            a.peer.signal(data.signal)
          }
        }
        break
    }
  }

  private createPeerListeners (target: string, peer: Peer.Instance, issource = false) {
    peer.on('signal', (data) => {
      switch (data.type) {
        case 'renegotiate':
          {
            const a = this.internalUsers.get(target)
            if (a) {
              RoomCell.LogMsg('Emitting renegotiate')
              a.renegotiating = true
              // a.isInit = false;
              this.makeSignal(target, data)
            }
          }
          break
        default:
          this.makeSignal(target, data)
          break
      }
    })
    this.createGeneralPeerListeners(target, peer, issource)
  }

  private createGeneralPeerListeners (target: string, peer: Peer.Instance, issource = false) {
    peer.on('error', err => { RoomCell.LogMsg('Got an error: ' + err) })
    peer.on('close', () => {
      // this.retryConnection(target, 0)
      RoomCell.LogMsg('Removing user')
      this.internalUsers.delete(target)
      this.call.removeRemoteUser(target)
      const a = this.users.get(target)
      this.makeRoomEvent(RoomCellPublicEvents.userLeaves, a)
      this.users.delete(target)
    })
    peer.on('connect', () => {
      const a = this.internalUsers.get(target)
      if (a) {
        if (!issource) {
          a.isInit = true
          this.sendID(target, true)
        }
      } else {
        RoomCell.LogMsg(`${target} is missing from the database?`)
      }
    })

    peer.on('data', (c) => {
      const d = this.destringify(c)
      switch (d.type) {
        case InternalRoomEvents.id:
          this.internalRoomIDEvent(target, peer, d.data)
          break
        case InternalRoomEvents.message:
          this.internalRoomMessageEvent(target, peer, d.data)
          break
        case InternalRoomEvents.voiceEvent:
          this.internalRoomVoiceEvent(target, peer, d.data)
          break
        case InternalRoomEvents.fileEvent:
          this.internalRoomFileEvent(target, peer, d.data)
          break
      }
    })
    peer.on('stream', (stream: MediaStream) => {
      this.call.addRemoteStream(target, stream)
    })
  }

  private sendData (data:any, ID?: string):void {
    if (ID) {
      const a = this.internalUsers.get(ID)
      if (a?.isInit) {
        a.peer.write(this.stringify(data))
      }
    } else {
      this.internalUsers.forEach(usr => {
        if (usr.isInit) {
          usr.peer.write(this.stringify(data))
        }
      })
    }
  }

  private sendID (target?: string, isInitial = false) {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.id, P2PMeshHelpers.makeID(this.roomCurrentUser, this.roomPWD, isInitial)), target)
  }

  private makeSignal (to: string, signal: any) {
    this.makeRoomEvent(RoomCellPublicEvents.signal, P2PMeshHelpers.makeSignal(to, this.roomID, signal))
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
  private internalRoomIDEvent (target: string, peer: Peer.Instance, idata:any) {
    const data:{user:ChannelUser, pwd: string, init:boolean} = idata
    const a = new ChannelUser(data.user.username, target, data.user.avatarLoc)
    const b = this.internalUsers.get(target)
    const bUsr = this.users.get(target)
    if (!data.init) {
      if (b && b.isInit && !bUsr) {
        this.users.set(target, a)
        this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
      } else {
        RoomCell.LogMsg('Unautorized connection attempt')
        peer.destroy()
      }
    } else if (b) {
      if (b.isInit) {
        RoomCell.LogMsg('User connected')
        this.users.set(target, a)
        this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
      } else {
        if (data.pwd === this.roomPWD) {
          RoomCell.LogMsg('User auth complete, user connected')
          b.isInit = true
          this.sendID(target, true)
          this.users.set(target, a)
          this.makeRoomEvent(RoomCellPublicEvents.userJoins, a)
        } else {
          RoomCell.LogMsg('Unautorized connection attempt')
          peer.destroy()
        }
      }
    }
  }

  private internalRoomMessageEvent (target: string, peer: Peer.Instance, data:any) {
    this.makeRoomEvent(RoomCellPublicEvents.newMessage, new MsgData(data.msg, target, data.files))
  }

  private internalRoomVoiceEvent (target: string, peer: Peer.Instance, data:{type:InternalVoiceEvents, special:any}) {
    switch (data.type) {
      case InternalVoiceEvents.joinCall:
        {
          const IsResponder: boolean = data.special
          const loc = this.call.getLocalStreamInfo()
          // Add to remoteStream sets, emit New User, reply if needed
          if (!IsResponder) {
            RoomCell.LogMsg('Someone joined a call')
            this.call.addRemoteUser(target)
            if (this.isInCall && loc) {
              RoomCell.LogMsg('Sending own info')
              this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, true), target)
              this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, { possibilities: loc.streams, primaryStream: loc.primaryStream }), target)
            }
          } else if (this.isInCall && loc) {
            RoomCell.LogMsg('Sending own info as response')
            this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, { possibilities: loc.streams, primaryStream: loc.primaryStream }), target)
          }
        }
        break
      case InternalVoiceEvents.leaveCall:
        this.call.removeRemoteUser(target)
        if (this.isInCall) {
          const userStream = this.call.getOutgoing(target)
          const trgetPeer = this.internalUsers.get(target)?.peer
          userStream.forEach(stream => {
            trgetPeer?.removeStream(stream)
          })
        }
        break
      case InternalVoiceEvents.addPossibleStream:
        {
          const IncomingData: {possibilities: Set<string>, primaryStream:string|undefined} = data.special
          this.call.addRemotePossibilities(target, IncomingData.primaryStream, IncomingData.possibilities)
          if (IncomingData.primaryStream && this.isInCall) { this.requestStream(target, IncomingData.primaryStream) }
        }
        break
      case InternalVoiceEvents.removePossibleStream:
        break
      case InternalVoiceEvents.getStream:
        this._requestStream(target, data.special)
        break
      case InternalVoiceEvents.removeStream:
        this._removeStream(target, data.special)
        break
    }
  }

  private internalRoomFileEvent (target: string, peer: Peer.Instance, data:{type: InternalFileEvents, special:any}) {
    switch (data.type) {
      case InternalFileEvents.newPossibleFile:
        {
          const tdata:FileData = data.special // No doc, assuming it works
          this.files.addRemoteFile(target, tdata)
          RoomCell.LogMsg(`Got new possbile file: UserID: ${target} FileID: ${tdata.FileID}`)
        }
        break
      case InternalFileEvents.lostPossibleFile:
        this.files.removeRemoteFile(target, data.special.FileID) // No doc, assuming it works
        break
      case InternalFileEvents.signalForMgr:
        RoomCell.LogMsg('Got mgr signaling data', 3)
        this.files.signal(target, data.special) // No doc, did not work, fixed
        break
    }
  }

  /**
   Chat stuff
   */

  sendMsg (message: string, files?: FileData[]): void {
    this.sendData(this.makeRoomSendable(InternalRoomEvents.message, P2PMeshHelpers.makeMsg(message, files || [])))
  }

  updateUser (user: ChannelUser): void {
    this.roomCurrentUser = user
    this.sendData(this.makeRoomSendable(InternalRoomEvents.id, P2PMeshHelpers.makeID(user, this.roomID, false)))
  }

  addUser (UserID: string):void {
    if (!this.internalUsers.has(this.userID)) {
      const a = new Peer({ initiator: true, trickle: true, config: UserConfig.getPeerConfig(), stream: new MediaStream() })
      this.createPeerListeners(UserID, a, true)
      this.internalUsers.set(UserID, { peer: a, isInit: false, initSender: true, renegotiating: false })
    } else {
      RoomCell.LogMsg('User with ID already exists')
    }
  }

  removeUser (UserID: string):void {
    this.internalUsers.delete(UserID)
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
          this.call.addLocalStream(stream, true)
          this.call.hasCamOn = false
          this.call.hasMicOn = false
          RoomCell.LogMsg('Current user force joined call - no audio or video')
          this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, P2PMeshHelpers.makeJoinCall(true)))
          this.sendAddPossibleStream()
          resolve(true)
        } else {
          RoomCell.getUsrMedia(audio, video).then(stream => {
            this.isInCall = true
            this.call.addLocalStream(stream, true)
            this.call.hasCamOn = video
            this.call.hasMicOn = audio
            RoomCell.LogMsg('Current user joined call')
            this.sendData(this.makeVoiceType(InternalVoiceEvents.joinCall, P2PMeshHelpers.makeJoinCall(true)))
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
      this.sendData(this.makeVoiceType(InternalVoiceEvents.leaveCall, P2PMeshHelpers.makeLeaveCall()))
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
        this.call.requestRemoteStream(VideoSourceID)
        this.sendData(this.makeVoiceType(InternalVoiceEvents.getStream, P2PMeshHelpers.makeGetStream(VideoSourceID)), UserID)
      }
    }
  }

  removeStream (UserID: string, VideoSourceID: string) {
    if (this.call.hasIncoming(UserID, VideoSourceID)) {
      // TODO: autoremove
      const stream = this.call.getRemoteStream(UserID, VideoSourceID)
      const remotePeer = this.internalUsers.get(UserID)?.peer
      if (stream && remotePeer) {
        remotePeer.removeStream(stream)
      }
      this.call.removeRemoteStream(UserID, VideoSourceID)
      this.sendData(this.makeVoiceType(InternalVoiceEvents.removeStream, P2PMeshHelpers.makeRemoveStream(VideoSourceID)), UserID)
    }
  }

  private _requestStream (userID: string, ID: string) {
    if (this.userID !== userID) {
      const stream = this.call.getLocalStreamForUser(userID, ID)
      if (stream) {
        const remotePeer = this.internalUsers.get(userID)?.peer
        if (remotePeer) {
          remotePeer.addStream(stream)
        }
      }
    }
  }

  private _removeStream (userID: string, ID:string):boolean {
    if (this.userID !== userID) {
      const stream = this.call.getLocalStream(ID)
      if (stream) {
        const remotePeer = this.internalUsers.get(userID)?.peer
        if (remotePeer) {
          remotePeer.removeStream(stream)
          this.call.removeOutgoing(userID, ID)
          return true
        }
      }
    }
    return false
  }

  private _removeLocalStream (ID:string):void {
    const stream = this.call.getLocalStream(ID)
    if (stream) {
      this.call.getOutgoingByStream(ID)?.forEach(usr => {
        const remotePeer = this.internalUsers.get(usr)?.peer
        if (remotePeer && stream) {
          remotePeer.removeStream(stream)
        }
      })
      this.call.removeLocalStream(ID)
      const a = this.call.getLocalStreamInfo()
      if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, P2PMeshHelpers.makeAddPossibleStream(a.streams, a.primaryStream))) }
      // Deprecated
      // this.sendData(this.makeVoiceType(InternalVoiceEvents.removePossibleStream, P2PMeshHelpers.makeRemotePossibleStream(ID)))
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
                const a = this.call.getLocalStreamInfo()
                if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, P2PMeshHelpers.makeAddPossibleStream(a.streams, a.primaryStream))) }
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
    if (a) { this.sendData(this.makeVoiceType(InternalVoiceEvents.addPossibleStream, P2PMeshHelpers.makeAddPossibleStream(a.streams, a.primaryStream))) }
  }
}
