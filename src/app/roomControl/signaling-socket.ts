import { Logger } from './../helpers/logMsg'
import { EventEmitter } from 'eventemitter3'
import { io } from 'socket.io-client'
import { SysConfig } from '../config/config'
enum InternalSignalingEvents {
  GET_ID= 'GET-ID',

  SIGNAL = 'SIGNAL',

  DISCONNECT = 'DISCONNECTEDUSER',
  ERROR = 'TYPEERROR',

  JOIN_ROOM = 'JOIN-ROOM',
  CREATE_ROOM = 'CREATE-ROOM',
  UPDATE_ROOM = 'UPDATE-ROOM'
}
export enum SignalingEvents {
  ROOM = 'ROOM',
  ROOM_ERROR = 'ROOM_ERROR',

  SIGNAL = 'SIGNAL',

  NEWUSER = 'NEWUSER',
  DISCONNECT = 'DISCONNECT'
}
export enum Errors{
  UNSPECIFIED,
  INVALID_PASSWORD,
  LIMIT_REACHED,
  NO_SUCH_ROOM,
  ROOM_ERROR
}
export enum RoomType {
  P2PMesh,
  SFUClientSide,
  SFUServerSide
}
class SendableRequests {
  public static makeId (requestId: string) {
    return { requestId: requestId }
  }

  public static makeSignal (source: string, target:string, room:string, signal:any) {
    return { source: source, target: target, room: room, signal: signal }
  }

  public static makeCreateRoom (requestId: string, maxUsers: number, name: string, password:string, type: RoomType) {
    return { requestId: requestId, maxUsers: maxUsers, name: name, password: password, type: type }
  }

  public static makeJoinRoom (requestId: string, room: string, password: string) {
    return { requestId: requestId, room: room, password: password }
  }

  public static makeUpdateRoom (requestId: string, room: string, maxUsers: number, name: string, password:string) {
    return { requestId: requestId, room: room, maxUsers: maxUsers, name: name, password: password }
  }

  public static makeDisconnect (roomId: string) {
    return roomId
  }
}
/**
 * Creates a connection to the webserver and uses it to send signals, etc.
 */
export class SignalingSocket extends EventEmitter {
  isReady = false
  ID = ''
  private socket = io(`${SysConfig.RUN_HTTPS ? 'wss' : 'ws'}://${SysConfig.HOSTNAME}`, { path: SysConfig.SIGNALING_PATH })
  private makeSignalingEvent (data:{type: SignalingEvents, data:any}):void {
    this.emit(data.type, data.data)
  }

  private LogMsg (msg:string, loglevel = 1) {
    Logger.Msg('Signaling socket', msg, loglevel)
  }

  constructor () {
    super()
    this.socket.on('connect', () => {
      this.LogMsg('Connected to server')
    })
    this.socket.on(InternalSignalingEvents.GET_ID, data => this._getID(data))

    this.socket.on(InternalSignalingEvents.CREATE_ROOM, data => this._createRoom(data))
    this.socket.on(InternalSignalingEvents.JOIN_ROOM, data => this._joinRoom(data))
    this.socket.on(InternalSignalingEvents.UPDATE_ROOM, data => this._updateRoom(data))

    this.socket.on(InternalSignalingEvents.SIGNAL, data => this._signal(data))

    this.socket.on(InternalSignalingEvents.DISCONNECT, (data:{userID: string, roomID: string}) => {
      this.makeSignalingEvent({ type: SignalingEvents.DISCONNECT, data: { ID: data.userID, room: data.roomID } })
    })
    this.socket.on(InternalSignalingEvents.ERROR, (data: {type: Errors, requestID: string}) => {
      let msg = ''
      switch (data.type) {
        case Errors.INVALID_PASSWORD:
          msg = 'Wrong password'
          break
        case Errors.LIMIT_REACHED:
          msg = 'User limit reached'
          break
        case Errors.NO_SUCH_ROOM:
          msg = 'Room does not exist'
          break
        case Errors.ROOM_ERROR:
          msg = 'Encountered an error while processing your request'
          break
      }
      this.makeSignalingEvent({ type: SignalingEvents.ROOM_ERROR, data: { msg: msg, target: undefined } })// TODO make an actual reID<->roomID table
    })

    this.socket.emit(InternalSignalingEvents.GET_ID, SendableRequests.makeId(this.getNextRequestID(InternalSignalingEvents.GET_ID)))
  }

  private _getID (data: {requestID: string, userID: string}) {
    if (this.getReqIDdata(data.requestID) === InternalSignalingEvents.GET_ID) {
      this.ID = data.userID
      this.isReady = true
    }
  }

  createRoom (maxUsers = 2, name:string, password = '', type: RoomType.P2PMesh|RoomType.SFUClientSide = RoomType.P2PMesh):void {
    if (this.isReady) {
      this.socket.emit(InternalSignalingEvents.CREATE_ROOM, SendableRequests.makeCreateRoom(this.getNextRequestID(type), maxUsers, name, password, type))
    }
  }

  private _createRoom (data: {roomID:string, requestID: string, password: string, name:string, maxUsers:number, curUsers:number}) {
    let b:RoomType = this.getReqIDdata(data.requestID)
    if (b === RoomType.P2PMesh || b === RoomType.SFUClientSide) {
      if (b === RoomType.SFUClientSide) b = RoomType.SFUServerSide
      this.LogMsg('Successfully created ' + data.name)
      const a = { ID: data.roomID, pwd: data.password, name: data.name, maxUsers: data.maxUsers, type: b, special: this.ID }
      this.makeSignalingEvent({ type: SignalingEvents.ROOM, data: { room: a } })
    } else { this.LogMsg(`Unknown request: ${data.requestID}`) }
  }

  joinRoom (roomId: string, pwd = ''):void {
    if (this.isReady) {
      this.socket.emit(InternalSignalingEvents.JOIN_ROOM, SendableRequests.makeJoinRoom(this.getNextRequestID({ roomId: roomId, pwd: pwd }), roomId, pwd))
    }
  }

  // Combination of {userID: string, roomID: string} and {roomID:string, requestID: string, password: string,name:string, maxUsers:number,curUsers:number}
  // Never actually contains both so check must be made (n dont care that this is "bad design")
  private _joinRoom (data: {from:{userID: string, roomID: string}, requestID: string, name:string, maxUsers:number, curUsers:number, type: RoomType, spec:any}):void {
    if (data.requestID) {
      const b:{roomId:string, pwd:string}|undefined = this.getReqIDdata(data.requestID)
      if (b) {
        this.LogMsg('Succsesfully joined ' + data.name)
        const a = { ID: b.roomId, pwd: b.pwd, name: data.name, maxUsers: data.maxUsers, type: data.type, special: data.spec }
        this.makeSignalingEvent({ type: SignalingEvents.ROOM, data: { room: a } })
      }
    } else {
      this.LogMsg(`Room: ${data.from.roomID}; New user: ${data.from.userID}`)
      this.makeSignalingEvent({ type: SignalingEvents.NEWUSER, data: { base: data.from.roomID, ID: data.from.userID } })
    }
  }

  updateRoom (room: string, maxUsers: number, name: string, password:string) {
    if (this.isReady) {
      this.socket.emit(InternalSignalingEvents.UPDATE_ROOM, SendableRequests.makeUpdateRoom(this.getNextRequestID(room), room, maxUsers, name, password))
    }
  }

  private _updateRoom (data: {requestID: string, password: string, name:string, maxUsers:number, curUsers:number}) {
    const a = this.getReqIDdata(data.requestID)
    if (a) {
      const b = { ID: a, pwd: data.password, name: data.name, maxUsers: data.maxUsers, update: true }
      this.makeSignalingEvent({ type: SignalingEvents.ROOM, data: { room: b } })
    }
  }

  leaveRoom (roomId:string) {
    this.socket.emit(InternalSignalingEvents.DISCONNECT, SendableRequests.makeDisconnect(roomId))
  }

  signal (data: {source: string, target:string, room: string, signal: any}) {
    this.socket.emit(SignalingEvents.SIGNAL, data)
  }

  private _signal (data: {source: string, target:string, room:string, signal:any}) {
    this.makeSignalingEvent({ type: SignalingEvents.SIGNAL, data: data })
  }

  reqIDtoType: Map<string, any> = new Map()
  lReq = 0
  private getNextRequestID (specData:any = undefined) {
    const a = (this.lReq++).toString(16)
    if (specData !== undefined) {
      this.LogMsg(`Setting ${a} to ${specData}`)
      this.reqIDtoType.set(a, specData)
    }
    return a
  }

  private getReqIDdata (reqID: string) {
    const a = this.reqIDtoType.get(reqID)
    if (a) {
      this.reqIDtoType.delete(reqID)
    }
    return a
  }
}
