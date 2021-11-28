import { Logger } from './../helpers/logMsg'
import { SFUServer } from './SFU-Server/SFUServer'
import { SFUClient } from './SFU-Client/SFUClient'
import { P2PMesh } from './P2P-Mesh/P2P-Mesh'
import { EventEmitter } from 'eventemitter3'
import u from 'simple-peer'
import { ChannelUser } from '../helpers/user'
import { RoomCellInterface } from '../interfaces/RoomCell.interface'
import { RoomCellPublicEvents } from '../helpers/RoomCell.enums'
import { RoomType, SignalingEvents, SignalingSocket } from './signaling-socket'

export enum RoomMgrEvents {
  RoomChanged = 'RoomChanged',
  VoiceRoomChanged = 'VoiceRoomChanged',
  RoomConnectionError = 'RoomConnectionError'
}
export class RoomMgr extends EventEmitter {
  static WEBRTC_SUPPORT:boolean = u.WEBRTC_SUPPORT
  socket = new SignalingSocket()
  Rooms = new Map<string, RoomCellInterface>()
  CurrentOpenRoom: RoomCellInterface|undefined
  CurrentOpenCallRoom: RoomCellInterface|undefined

  constructor (public thisUser: ChannelUser) {
    super()

    this.socket.on(SignalingEvents.SIGNAL, (data:{source: string, target:string, room:string, signal:any}) => {
      const a = this.Rooms.get(data.room)
      if (a) {
        if (data.target === a.externalID && data.source !== a.externalID) {
          a.signal({ from: data.source, signal: data.signal })
        }
      }
    })
    this.socket.on(SignalingEvents.ROOM_ERROR, (data: {msg: string, target:string}) => {
      this.emit(RoomMgrEvents.RoomConnectionError, { msg: data.msg, ID: data.target })
    })
    this.socket.on(SignalingEvents.ROOM, (data:{room:{ID:string, pwd: string, name:string, maxUsers:number, type: RoomType, special: undefined|string}}) => {
      thisUser.id = this.socket.ID
      RoomMgr.LogMsg(data, 2)
      const eRoom = this.Rooms.get(data.room.ID)
      if (eRoom) {
        if (eRoom instanceof SFUServer) {
          eRoom.updateRoom(data.room)
        } else {
          // Client sent room update request?
          RoomMgr.LogMsg('Attempted to update a non-SFUServer type room', 1)
        }
      } else {
        let room: RoomCellInterface|undefined
        switch (data.room.type) {
          case RoomType.P2PMesh:
            RoomMgr.LogMsg('Creating a room - P2P', 1)
            room = new P2PMesh(thisUser.id, data.room.ID, data.room.name, data.room.pwd, data.room.maxUsers, thisUser)
            break
          case RoomType.SFUClientSide:
            RoomMgr.LogMsg('Creating a room - SFU Client', 1)
            room = new SFUClient(thisUser.id, data.room.ID, data.room.name, data.room.pwd, data.room.maxUsers, thisUser)
            break
          case RoomType.SFUServerSide:
            RoomMgr.LogMsg('Creating a room - SFU Server', 1)
            room = new SFUServer(thisUser.id, data.room.ID, data.room.name, data.room.pwd, data.room.maxUsers, thisUser)
            break
        }
        if (room) {
          RoomMgr.LogMsg('Registering a room', 1)
          room.on(RoomCellPublicEvents.signal, (data) => {
            this.socket.signal(data)
          })
          // TODO Make this bit shorter
          room.on(RoomCellPublicEvents.userJoins, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userJoins, tData)
          })
          room.on(RoomCellPublicEvents.userLeaves, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userLeaves, tData)
          })
          room.on(RoomCellPublicEvents.userUpdates, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userUpdates, tData)
          })
          room.on(RoomCellPublicEvents.userJoinsCall, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userJoinsCall, tData)
          })
          room.on(RoomCellPublicEvents.userLeavesCall, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userLeavesCall, tData)
          })
          room.on(RoomCellPublicEvents.newMessage, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.newMessage, tData)
          })
          room.on(RoomCellPublicEvents.userAddsVideoStream, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userAddsVideoStream, tData)
          })
          room.on(RoomCellPublicEvents.userRemovesVideoStream, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.userRemovesVideoStream, tData)
          })
          room.on(RoomCellPublicEvents.recvVideoStream, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.recvVideoStream, tData)
          })
          room.on(RoomCellPublicEvents.remvVideoStream, (tData) => {
            if (room?.roomID === this.CurrentOpenRoom?.roomID) this.emit(RoomCellPublicEvents.remvVideoStream, tData)
          })
          this.Rooms.set(data.room.ID, room)
          this.CurrentOpenRoom = room
          this.emit(RoomMgrEvents.RoomChanged)
        }
      }
    })
    this.socket.on(SignalingEvents.DISCONNECT, (data:{ID:string, base:string}) => {
      this.Rooms.get(data.base)?.removeUser(data.ID)
    })
    this.socket.on(SignalingEvents.NEWUSER, (data:{ID:string, base:string}) => {
      this.Rooms.get(data.base)?.addUser(data.ID)
    })
  }

  changeGlobalUserForFuture (newUser: ChannelUser) {
    this.thisUser = newUser
  }

  changeGlobalUser (newUser: ChannelUser) {
    this.changeGlobalUserForFuture(newUser)
    this.Rooms.forEach(room => {
      room.updateUser(newUser)
    })
  }

  LeaveRoom (ID:string) {
    const a = this.Rooms.get(ID)
    if (a) {
      if (a.roomID === this.CurrentOpenRoom?.roomID) {
        this.CurrentOpenRoom = undefined
        this.emit(RoomMgrEvents.RoomChanged)
      }
      if (a.roomID === this.CurrentOpenCallRoom?.roomID) {
        this.CurrentOpenCallRoom = undefined
        this.emit(RoomMgrEvents.VoiceRoomChanged)
      }
      this.socket.leaveRoom(ID)
      a.leaveRoom()
      this.Rooms.delete(ID)
    }
  }

  JoinRoom (ID: string, pwd:string) {
    pwd = this.handlePwd(pwd)
    this.socket.joinRoom(ID, pwd)
  }

  CreateRoom (pwd:string, rname:string, maxUsers: number, type: RoomType.P2PMesh|RoomType.SFUClientSide) {
    maxUsers = maxUsers > 20 ? 20 : (maxUsers < 2 ? 2 : maxUsers)
    rname = rname.length > 20 ? rname.substring(0, 20) : rname
    pwd = this.handlePwd(pwd)
    this.socket.createRoom(maxUsers, rname, pwd, type)
  }

  private handlePwd (pwd:string) {
    if (pwd.length > 32) {
      pwd = pwd.substring(0, 32)
      RoomMgr.LogMsg('Substringing password', 1)
    }
    return pwd
  }

  LeaveCall (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.CurrentOpenCallRoom?.leaveCall().then(() => {
        resolve()
      }).catch(() => {
        reject(new Error())
      })
      this.CurrentOpenCallRoom = undefined
    })
  }

  JoinCall (audio: boolean, video:boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.CurrentOpenRoom) {
        if (this.CurrentOpenCallRoom) {
          this.CurrentOpenCallRoom.leaveCall()
        }
        this.CurrentOpenCallRoom = this.CurrentOpenRoom
        this.CurrentOpenRoom.joinCall(audio, video).then(result => {
          if (result) {
            resolve()
          } else {
            reject(new Error())
          }
        }).catch(() => { reject(new Error()) })
      } else {
        reject(new Error())
      }
    })
  }

  public static LogMsg (msg:any, loglevel = 1) {
    Logger.Msg('Room mgr', msg, loglevel)
  }

  /* public static createWorker(WorkerFunction: any, WorkerName: string): Worker{
    return new Worker(window.URL.createObjectURL(new Blob(WorkerFunction.toString())))
    navigator?.serviceWorker?.controller?.postMessage(
      [ `/workers/${WorkerName}.js`, '(' + WorkerFunction.toString() + ')()' ]
    );

    // Insert via ServiceWorker.onmessage. Or directly once window.caches is exposed
    caches.open( 'cache' ).then( (cache)=>
    {
    cache.put( `/workers/${WorkerName}.js`,
      new Response( WorkerFunction, { headers: {'content-type':'application/javascript'}})
    );
    });
  } */
}
