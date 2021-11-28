import { Logger } from './../../helpers/logMsg'
/**
 * The "basic" stream mgr
 */
export class BaseStreamMgr {
  streams: Map<string, Map<string, MediaStream>> = new Map()
  streamInfo: Map<string, {primaryStream: string|undefined, streams: Set<string>}> = new Map()
  connectionMap: Map<string, Map<string, Set<string>>> = new Map()
  private awaitingStreams: Set<string> = new Set()
  localID: string

  constructor (localID: string) {
    this.localID = localID
    // this.addUser(localID); SFU Client no likey
  }

  addPossibilities (userID: string, primaryStream: string|undefined, streams: Set<string>|undefined) {
    this.addUser(userID)
    const lostStreams = new Set<string>()
    if (streams === undefined) {
      streams = new Set<string>()
    }
    this.streamInfo.set(userID, { primaryStream: primaryStream, streams: streams })
    const _remoteUserStreams = this.streams.get(userID)
    if (_remoteUserStreams) {
      _remoteUserStreams.forEach((value, key) => {
        if (!streams?.has(key)) {
          _remoteUserStreams?.delete(key)
          lostStreams.add(key)
        }
      })
    }
    lostStreams.forEach(str => {
      this.connectionMap.get(userID)?.delete(str)
    })
    return lostStreams
  }

  requestStream (streamID: string) {
    this.awaitingStreams.add(streamID)
  }

  addStream (userID: string, stream: MediaStream) {
    if (this.awaitingStreams.has(stream.id) || this.localID === userID) {
      this.LogMsg(`Received a remote stream from user ${userID} with ID ${stream.id}`)
      this.addUser(userID)
      this.awaitingStreams.delete(stream.id)
      this.streams.get(userID)?.set(stream.id, stream)
      this.streamInfo.get(userID)?.streams.add(stream.id)
      if (!this.connectionMap.get(userID)?.has(stream.id)) {
        this.connectionMap.get(userID)?.set(stream.id, new Set())
      }
      this.connectionMap.get(userID)?.get(stream.id)?.add(this.localID)
      return true
    } else {
      this.LogMsg(`Declining a remote stream from user ${userID} with ID ${stream.id}`)
      return false
    }
  }

  getStream (userID: string, streamID: string) {
    return this.streams.get(userID)?.get(streamID)
  }

  removeStream (userID: string, streamID: string) {
    const a = this.streams.get(userID)?.get(streamID)
    if (a !== undefined) {
      a.getTracks().forEach(t => t.stop())
      this.streamInfo.get(userID)?.streams.delete(streamID)
      this.streams.get(userID)?.delete(streamID)
      this.connectionMap.get(userID)?.delete(streamID)
      return true
    }
    return false
  }

  addUser (userID: string) {
    if (!this.streams.has(userID)) {
      this.streams.set(userID, new Map())
      this.streamInfo.set(userID, { primaryStream: undefined, streams: new Set() })
      this.connectionMap.set(userID, new Map())
      return true
    }
    return false
  }

  removeUser (userID: string) {
    if (this.streams.has(userID)) {
      this.streams.get(userID)?.forEach((stream) => {
        stream.getTracks().forEach(t => t.stop())
      })
      this.streams.delete(userID)
      this.streamInfo.delete(userID)
      this.connectionMap.delete(userID)
      this.connectionMap.forEach((val) => {
        val.forEach(set => {
          set.delete(userID)
        })
      })
      return true
    }
    return false
  }

  private LogMsg (msg: string, loglevel = 2) {
    Logger.Msg('Base stream mgr', msg, loglevel)
  }
}
