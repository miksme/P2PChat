import { SysConfig } from './../config/config'
export class Logger {
  public static Msg (preString: string, msg:any, loglevel = 1) {
    if (SysConfig.LOG_LEVEL >= loglevel) {
      if (typeof msg === 'string') {
        const a = new Date()
        console.log(`[${a.getHours()}:${a.getMinutes()}:${a.getSeconds()}.${a.getMilliseconds()}] ${preString}: ${msg}`)
      } else { console.log(msg) }
    }
  }
}
