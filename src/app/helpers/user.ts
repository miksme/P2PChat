import { SysConfig } from './../config/config'

export class ChannelUser {
  static defaultPath = `http${SysConfig.RUN_HTTPS ? 's' : ''}://${SysConfig.HOSTNAME}`
  static defaultUserPath = '/public/defaults/User.jpg'
  static allowedPaths = [ChannelUser.defaultPath, 'https://cdn.discordapp.com/']
  constructor (public username: string = '', public id: string = '', public avatarLoc: string = ChannelUser.defaultPath + ChannelUser.defaultUserPath) {
    this.avatarLoc = this.vertifyAvatarLoc() ? this.avatarLoc : ChannelUser.defaultUserPath
  }

  public vertifyAvatarLoc ():boolean {
    for (let i = 0; i < ChannelUser.allowedPaths.length; i++) {
      if (this.avatarLoc.startsWith(ChannelUser.allowedPaths[i])) { return true }
    }
    return false
  }
}
