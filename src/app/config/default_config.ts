// The "default" configuration file
// Rename to "config.ts" to get your app to build

/**
 * Does not change regardless of browsers
 */
export class SysConfig {
  public static readonly VERSION = '1.0.0'
  public static readonly PORT = window.location.port
  public static readonly RUN_HTTPS = window.location.protocol === 'https:'
  public static readonly HOSTNAME = window.location.hostname
  public static readonly SIGNALING_PATH = '/api/signaling/'
  public static readonly DEFAULT_PFP_LOC = `http${SysConfig.RUN_HTTPS ? 's' : ''}://${SysConfig.HOSTNAME}/public/defaults/User.jpg`
  public static readonly LOG_LEVEL = 1

  public static readonly SFU_MSG_HISTORY = 0 // Does not and probably will not do anything

  public static readonly STUNSERVER = [{ urls: 'stun:stun.l.google.com:19302' }]
  public static readonly TURNSERVER = [{}]
}
/**
 * Does change depending on the browser/user choices
 */
export class UserConfig {
  // Default STUN/TURN config
  public static STUNserver = SysConfig.STUNSERVER
  public static TURNserver = SysConfig.TURNSERVER

  // Browser tests
  public static storageEnabled: boolean
  public static webrtcEnabled: boolean
  public static webworkersEnabled: boolean

  // Other user-changable stuff
  public static defaultUsername = 'user'
  public static defaultPfP: string = SysConfig.DEFAULT_PFP_LOC

  public static displayPfPs = true
  public static downloadLinks = false
  public static displayContentFromUsers = false
  public static downloadDisplayableContentFromUsers = false

  // File stuff
  public static allowFileTransfer = true
  public static fileSizeBoundaryForWorker = 1024 * 1024 * 30
  public static fileWorkerPeerAmount = 1
  public static useWorkersForFiles = true
  public static maxActiveSingleThreadFileActions = 4
  public static maxActiveFileActions = 8
  public static fileWaitingTimeoutInSeconds = 60

  // Currently active download/upload count. Changes at runtime
  public static globalActiveSingleThreadActionCount = 0
  public static globalActiveActionCount = 0

  // Save user config
  public static saveUserConfig = true

  private static peerConf:any = undefined
  // So that peer config is generated only once
  public static getPeerConfig () {
    if (!UserConfig.peerConf) {
      UserConfig.peerConf = UserConfig.generatePeerConfig()
    }
    return UserConfig.peerConf
  }

  private static generatePeerConfig () {
    const a:any[] = UserConfig.STUNserver
    for (let i = 0; i < UserConfig.TURNserver.length; i++) {
      a.push(UserConfig.TURNserver[i])
    }
    return { iceServers: a, sdpSemantics: 'unified-plan', reconnection: true, reconnectionDelay: 2000, reconnectionAttempts: 20 }
  }
}
