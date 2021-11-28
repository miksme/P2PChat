import { FileData } from './fileData'
export class Msg {
  constructor (public userid: string, public room: string, public msg: string = '') {
    this.msg = this.msg.length > 2000 ? this.msg.substring(0, 2000) : this.msg
  }
}
export class ChannelMsg {
  constructor (public userid: string, public msg: string = '') {
    this.msg = this.msg.length > 2000 ? this.msg.slice(0, 2000) : this.msg
  }
}
export class CompleteChannelMsg {
  constructor (public username: string, public msg: string = '', public pfpLoc:string, public id:string) {
    this.msg = this.msg.length > 2000 ? this.msg.substring(0, 2000) : this.msg
  }
}
export class MsgData {
  constructor (public msg: string = '', public id:string, public additionalContent: FileData[]|undefined) {
    this.msg = this.msg.length > 2000 ? this.msg.substring(0, 2000) : this.msg
    if (additionalContent && additionalContent.length > 5) {
      additionalContent = additionalContent.slice(0, 5)
    }
  }
}
