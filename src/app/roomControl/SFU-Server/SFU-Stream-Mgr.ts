import { BaseStreamMgr } from '../stream-management/BaseStreamMgr'
import { StreamMgrPublicInterface } from '../../interfaces/StreamMgr.public.interface'
import { EncodeStreamEvents } from '../stream-management/streamEvents'
import { RoomCellPublicEvents } from '../../helpers/RoomCell.enums'
import { EventEmitter } from 'eventemitter3'
export class SFUServerStreamMgr extends EventEmitter implements StreamMgrPublicInterface {
  private baseMgr: BaseStreamMgr
  constructor (localID: string) {
    super()
    this.baseMgr = new BaseStreamMgr(localID)
  }

  hasMicOn = false
  hasCamOn = false
  hasScreenshareOn = false
  getMicState ():boolean {
    return this.hasMicOn
  }

  getCamState ():boolean {
    return this.hasCamOn
  }

  getScrState ():boolean {
    return this.hasScreenshareOn
  }

  removeLocalStream (streamID: string) {
    const success = this.baseMgr.removeStream(this.baseMgr.localID, streamID)
    if (success) {
      // Event : local stream lost
      this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(this.baseMgr.localID, streamID))
    }
  }

  addLocalStream (stream: MediaStream, isPrimary: boolean) {
    const success = this.baseMgr.addStream(this.baseMgr.localID, stream)
    if (success) {
      if (isPrimary) {
        const a = this.baseMgr.streamInfo.get(this.baseMgr.localID)
        if (a) {
          a.primaryStream = stream.id
        }
      }
      // Event : new local stream
      this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(this.baseMgr.localID, stream))
    }
  }

  addRemotePossibilities (userID: string, primaryStream: string|undefined, streams: Set<string>|undefined) {
    if (streams === undefined) {
      streams = new Set<string>()
    }
    const lost = this.baseMgr.addPossibilities(userID, primaryStream, streams)
    lost.forEach(streamID => {
      // Event : lost MediaStream from remote user
      this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(userID, streamID))
    })
    // Event : new possibility set (has to iterate through all of them)
    this.emit(RoomCellPublicEvents.userAddsVideoStream, EncodeStreamEvents.updatedStreamInfo(userID, streams, primaryStream))
  }

  requestedStreamSet: Map<string, Set<string>> = new Map()
  requestRemoteStream (userID: string, streamID: string) {
    this.baseMgr.requestStream(streamID)
    if (!this.requestedStreamSet.has(streamID)) {
      this.requestedStreamSet.set(streamID, new Set())
    }
    this.requestedStreamSet.get(streamID)?.add(userID)
  }

  addRemoteStreamToLocal (userID: string, stream: MediaStream) {
    this.baseMgr.connectionMap.get(userID)?.get(stream.id)?.add(this.baseMgr.localID)
    this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(userID, stream))
  }

  addRemoteStream (userID: string, stream: MediaStream) {
    const success = this.baseMgr.addStream(userID, stream)
    if (success) {
      const a = this.requestedStreamSet.get(stream.id)
      this.requestedStreamSet.delete(stream.id)
      if (a?.has(this.baseMgr.localID)) {
        a.delete(this.baseMgr.localID)
        // Event : new local stream
        this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(userID, stream))
      } else {
        this.baseMgr.connectionMap.get(userID)?.get(stream.id)?.delete(this.baseMgr.localID)
      }
      const b = this.baseMgr.connectionMap.get(userID)?.get(stream.id)
      if (b !== undefined) {
        a?.forEach(usr => {
          b?.add(usr)
        })
      }
      return a
    }
    return undefined
  }

  getRemoteStream (userID: string, streamID: string) {
    return this.baseMgr.streams.get(userID)?.get(streamID)
  }

  vertifyIfHasRemoteStream (userID: string, streamID: string) {
    const a = this.baseMgr.streams.get(userID)?.get(streamID)
    if (a !== undefined) {
      this.baseMgr.connectionMap.get(userID)?.get(streamID)?.add(this.baseMgr.localID)
      this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(userID, a))
      return true
    }
    return false
  }

  vertifyIfHasLocalStream (streamID: string) {
    const a = this.baseMgr.streams.get(this.baseMgr.localID)?.get(streamID)
    if (a !== undefined) {
      this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(this.baseMgr.localID, a))
      return true
    }
    return false
  }

  removeRemoteStream (userID: string, streamID: string) {
    const success = this.baseMgr.removeStream(userID, streamID)
    if (success) {
      this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(userID, streamID))
    }
  }

  removeStreamConnection (streamUserID: string, streamHostID: string, streamID: string) {
    const a = this.baseMgr.streams.get(streamHostID)?.get(streamID)
    if (a !== undefined) {
      this.baseMgr.connectionMap.get(streamHostID)?.get(streamID)?.delete(streamUserID)
      const s = this.baseMgr.connectionMap.get(streamHostID)?.get(streamID)?.size
      if (s === 0) {
        a.getTracks().forEach(t => t.stop())
        this.baseMgr.streamInfo.get(streamHostID)?.streams.delete(streamID)
        this.baseMgr.streams.get(streamHostID)?.delete(streamID)
        this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(streamHostID, streamID))
        this.baseMgr.connectionMap.get(streamHostID)?.delete(streamID)
      }
      if (streamUserID === this.baseMgr.localID) {
        this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(streamHostID, streamID))
      }
      return s
    }
    return 0
  }

  addRemoteUser (userID: string) {
    const success = this.baseMgr.addUser(userID)
    if (success) {
      // Event : new call user
      this.emit(RoomCellPublicEvents.userJoinsCall, EncodeStreamEvents.newUser(userID))
    }
    return success
  }

  removeRemoteUser (userID: string) {
    this.baseMgr.streams.get(userID)?.forEach(stream => {
      this.emit(RoomCellPublicEvents.remvVideoStream, EncodeStreamEvents.lostStream(userID, stream.id))
    })
    const success = this.baseMgr.removeUser(userID)
    if (success) {
      // Event : lost call user
      this.emit(RoomCellPublicEvents.userLeavesCall, EncodeStreamEvents.lostUser(userID))
    }
  }

  closeLocalUser () {
    this.hasCamOn = false
    this.hasMicOn = false
    this.hasScreenshareOn = false
    this.removeRemoteUser(this.baseMgr.localID)
    // this.baseMgr.addUser(this.baseMgr.localID);
  }

  getProvidedStreams (userID: string) {
    // Similar func was used before in RoomCells so while it is inefficient atleast it matches output
    const a: Map<string, Set<string>> = new Map()
    this.baseMgr.connectionMap.get(userID)?.forEach((users, streamID) => {
      users.forEach(user => {
        if (!a.has(user)) {
          a.set(user, new Set())
        }
        a.get(user)?.add(streamID)
      })
    })
    const b: Map<string, Set<MediaStream>> = new Map()
    a.forEach((streams, user) => {
      const c: Set<MediaStream> = new Set()
      streams.forEach(streamID => {
        const d = this.baseMgr.streams.get(userID)?.get(streamID)
        if (d !== undefined) {
          c.add(d)
        }
      })
      b.set(user, c)
    })
    return b
  }

  removeOutgoing (userID: string, streamID: string) {
    this.baseMgr.connectionMap.get(this.baseMgr.localID)?.get(streamID)?.delete(userID)
  }

  getOutgoing (userID: string) {
    // Similar func was used before in RoomCells so while it is inefficient atleast it matches output
    const a: Set<string> = new Set()
    this.baseMgr.connectionMap.get(this.baseMgr.localID)?.forEach((users, streamID) => {
      if (users.has(userID)) {
        a.add(streamID)
      }
    })
    const b: Set<MediaStream> = new Set()
    a.forEach((streamID) => {
      const d = this.baseMgr.streams.get(this.baseMgr.localID)?.get(streamID)
      if (d !== undefined) {
        b.add(d)
      }
    })
    return b
  }

  getOutgoingByStream (streamID: string) {
    return this.baseMgr.connectionMap.get(this.baseMgr.localID)?.get(streamID)
  }

  getUsedStreams () {
    // Similar func was used before in RoomCells so while it is inefficient atleast it matches output
    const a: Map<string, Set<string>> = new Map()
    this.baseMgr.connectionMap.get(this.baseMgr.localID)?.forEach((users, streamID) => {
      users.forEach(user => {
        if (!a.has(user)) {
          a.set(user, new Set())
        }
        a.get(user)?.add(streamID)
      })
    })
    const b: Map<string, Set<MediaStream>> = new Map()
    a.forEach((streams, user) => {
      const c: Set<MediaStream> = new Set()
      streams.forEach(streamID => {
        const d = this.baseMgr.streams.get(this.baseMgr.localID)?.get(streamID)
        if (d !== undefined) {
          c.add(d)
        }
      })
      b.set(user, c)
    })
    return b
  }

  hasIncoming (userID: string, streamID: string) {
    return !!this.baseMgr.connectionMap.get(userID)?.get(streamID)?.has(this.baseMgr.localID)
  }

  hasConnection (userID: string, streamHostID: string, streamID: string) {
    return this.baseMgr.connectionMap.get(streamHostID)?.get(streamID)?.has(userID)
  }

  getLocalPrimary () {
    const a = this.baseMgr.streamInfo.get(this.baseMgr.localID)?.primaryStream
    if (a !== undefined) { return this.baseMgr.getStream(this.baseMgr.localID, a) }
    return undefined
  }

  getLocalStreamInfo () {
    return this.baseMgr.streamInfo.get(this.baseMgr.localID)
  }

  getRemoteStreamInfo (userID: string) {
    return this.baseMgr.streamInfo.get(userID)
  }

  getRemoteStreamInfos () {
    return this.baseMgr.streamInfo
  }

  getLocalStream (streamID: string) {
    return this.baseMgr.getStream(this.baseMgr.localID, streamID)
  }

  getLocalStreams () {
    return this.baseMgr.streams.get(this.baseMgr.localID)
  }

  getStreamForUser (userID: string, streamHostID: string, streamID: string) {
    if (!this.baseMgr.connectionMap.get(streamHostID)?.get(streamID)?.has(userID)) {
      this.baseMgr.connectionMap.get(streamHostID)?.get(streamID)?.add(userID)
    }
    return this.baseMgr.getStream(streamHostID, streamID)
  }
}
