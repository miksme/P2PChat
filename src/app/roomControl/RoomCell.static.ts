import { Logger } from './../helpers/logMsg'

export class RoomCell {
  /** Type 'false | { echoCancellation: true; noiseSuppression: true; sampleRate: number; }' is not assignable to type 'boolean | MediaTrackConstraints | undefined'.
    NOW IT IS
   */
  /**
   * Gets user media
   * @param audio Get audio?
   * @param video Get video?
   * @returns A nice MediaStream or a not-so-nice failure
   */
  public static getUsrMedia (audio: boolean, video: boolean): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      navigator.mediaDevices.getUserMedia({ audio: audio ? { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } : false, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false }).then((stream:MediaStream) => {
        resolve(stream)
      }, (prob: any) => {
        RoomCell.LogMsg(prob)
        reject(new Error())
      })
    })
  }

  /**
   * Gets a screenshare
   * @returns A nice MediaStream or a not-so-nice failure
   */
  public static getUsrDesktopMedia (): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      navigator.mediaDevices.getDisplayMedia({ audio: true, video: { logicalSurface: true, cursor: 'always', width: { ideal: 1920 }, height: { ideal: 1080 } } }).then((stream: MediaStream) => {
        resolve(stream)
      }, er => {
        RoomCell.LogMsg(er)
        reject(new Error())
      })
    })
  }

  public static LogMsg (msg:any, loglevel = 1) {
    Logger.Msg('Peer handler', msg, loglevel)
  }
}
