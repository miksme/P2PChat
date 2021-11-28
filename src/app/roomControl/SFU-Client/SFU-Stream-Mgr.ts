import { BaseStreamMgr } from '../stream-management/BaseStreamMgr'
import { StreamMgrPublicInterface } from '../../interfaces/StreamMgr.public.interface'
import { EncodeStreamEvents } from '../stream-management/streamEvents'
import { RoomCellPublicEvents } from '../../helpers/RoomCell.enums'
import { EventEmitter } from 'eventemitter3'
export class SFUClientStreamMgr extends EventEmitter implements StreamMgrPublicInterface {
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

  changeID (newID: string) {
    {
      const a = this.baseMgr.streams.get(this.baseMgr.localID)
      if (a) {
        this.baseMgr.streams.set(newID, a)
        this.baseMgr.streams.delete(this.baseMgr.localID)
      }
    }
    {
      const a = this.baseMgr.streamInfo.get(this.baseMgr.localID)
      if (a) {
        this.baseMgr.streamInfo.set(newID, a)
        this.baseMgr.streamInfo.delete(this.baseMgr.localID)
      }
    }
    {
      const a = this.baseMgr.connectionMap.get(this.baseMgr.localID)
      if (a) {
        this.baseMgr.connectionMap.set(newID, a)
        this.baseMgr.connectionMap.delete(this.baseMgr.localID)
      }
    }

    this.baseMgr.connectionMap.forEach((conn) => {
      conn.forEach((users) => {
        if (users.has(this.baseMgr.localID)) {
          users.add(newID)
          users.delete(this.baseMgr.localID)
        }
      })
    })

    this.baseMgr.localID = newID
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

  awaiting: Map<string, string> = new Map()
  requestRemoteStream (userID: string, streamID: string) {
    this.baseMgr.requestStream(streamID)
    this.awaiting.set(streamID, userID)
  }

  addRemoteStream (userID: string, stream: MediaStream) {
    const a = this.awaiting.get(stream.id)
    if (a !== undefined) {
      this.awaiting.delete(stream.id)
      const success = this.baseMgr.addStream(a, stream)
      if (success) {
        // Event : new local stream
        this.emit(RoomCellPublicEvents.recvVideoStream, EncodeStreamEvents.gainedStream(a, stream))
      }
    }
  }

  getRemoteStream (userID: string, streamID: string) {
    return this.baseMgr.streams.get(userID)?.get(streamID)
  }

  vertifyIfHasRemoteStream (userID: string, streamID: string) {
    const a = this.baseMgr.streams.get(userID)?.get(streamID)
    if (a !== undefined) {
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

  addRemoteUser (userID: string) {
    const success = this.baseMgr.addUser(userID)
    if (success) {
      // Event : new call user
      this.emit(RoomCellPublicEvents.userJoinsCall, EncodeStreamEvents.newUser(userID))
    }
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
    return this.baseMgr.connectionMap.get(userID)?.get(streamID)?.has(this.baseMgr.localID)
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

  getLocalStreamForUser (userID: string, streamID: string) {
    this.baseMgr.connectionMap.get(this.baseMgr.localID)?.get(streamID)?.add(userID)
    return this.getLocalStream(streamID)
  }

  removeOutgoingForServer (streamID: string) {
    if (this.baseMgr.connectionMap.get(this.baseMgr.localID)?.has(streamID)) {
      this.baseMgr.connectionMap.get(this.baseMgr.localID)?.set(streamID, new Set())
    }
  }

  getLocalStreamForServer (streamID: string) {
    this.baseMgr.connectionMap.get(this.baseMgr.localID)?.get(streamID)?.add('-1')
    return this.getLocalStream(streamID)
  }
}
