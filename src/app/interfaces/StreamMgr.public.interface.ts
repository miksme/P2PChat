
/**
 *Interface for providing details about room stream state for both frontend and backend
 *
 * @export
 * @interface StreamMgrPublicInterface
 */
export interface StreamMgrPublicInterface {
  /**
   * The "simple" way
   * A single user can only have a signle mic+cam and a single screenshare
   * A superficial limitation but makes it a lot more simple
   */
  /**
   * Returns boolean indicating if local user is sending mic data
   */
  getMicState():boolean
  /**
   * Returns boolean indicating if local user is sending cam data
   */
  getCamState():boolean
  /**
   * Returns boolean indicating if local user is sending sreenshare data
   */
  getScrState():boolean

  /**
   * Get info about local user
   */
  getLocalStreamInfo():{
    primaryStream: string | undefined;
    streams: Set<string>;
  }|undefined
  /**
   * Get info about remote user
   * @param userID Remote user ID
   */
  getRemoteStreamInfo(userID: string):{
    primaryStream: string | undefined;
    streams: Set<string>;
  } | undefined
  /**
   * Get a local MediaStream with a gived ID
   * @param streamID MediaStream ID
   */
  getLocalStream(streamID: string): MediaStream | undefined
  /**
   * Get local mediastreams
   */
  getLocalStreams(): Map<string, MediaStream>|undefined
  /**
   * Get info of all remote users
   */
  getRemoteStreamInfos(): Map<string, {
    primaryStream: string | undefined;
    streams: Set<string>;
  }>
}
