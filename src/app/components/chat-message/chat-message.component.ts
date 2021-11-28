import { ChangeDetectorRef, Component, Input, ViewChild, ViewContainerRef, ComponentFactory } from '@angular/core'
import { IMsg, IMsgInsecureSpecialData } from '../../interfaces/msg.interface'
import { ChatMessageFileObjectComponent } from '../chat-message-file-object/chat-message-file-object.component'
import { SysConfig } from './../../config/config'
import { isMedia } from '../../helpers/isMedia'
import { DomSanitizer } from '@angular/platform-browser'
@Component({
  selector: 'app-chat-message',
  templateUrl: './chat-message.component.html',
  styleUrls: ['./chat-message.component.css']
})
export class ChatMessageComponent implements IMsg {
  config = SysConfig
  maxSpecial = 4
  @Input() data: {user:string, msg:string, other:string, time:string, id:string, special:string, pfpLoc:string} = { id: '', other: '', user: '', msg: '', time: '', special: '', pfpLoc: '' }
  @ViewChild('otherData', { read: ViewContainerRef }) otherData: ViewContainerRef|undefined
  private ref: ChangeDetectorRef
  private san:DomSanitizer
  useOtherObjs = false
  bypassForAngular: Array<any> = []

  constructor (ref: ChangeDetectorRef, san:DomSanitizer) {
    this.ref = ref
    this.san = san
  }

  addDataManual (data:{user:string, msg:string, time:string, id:string, special:string, pfpLoc:string, other:string}, allowLinkDownload: boolean) {
    let msgData = ChatMessageComponent.escapeHtml(data.msg)
    const _matches = isMedia.getLinks(msgData.toLowerCase())
    if (_matches !== null) {
      const matches = new Set(_matches)
      matches.forEach(match => {
        if (allowLinkDownload && this.maxSpecial !== 0 && match.startsWith('https')) {
          this.maxSpecial -= 1
          if (isMedia.isImage(match)) {
            data.other += `<img src="${match}" class="MsgContent mt-1 mb-1"></img>`
          } else if (isMedia.isVideo(match)) {
            data.other += `<video src="${match}" class="MsgContent mt-1 mb-1" controls></video>`
          } else if (isMedia.isAudio(match)) {
            data.other += `<audio src="${match}" class="MsgContent mt-1 mb-1" controls></audio>`
          } else {
            this.maxSpecial += 1
          }
          msgData = ChatMessageComponent.fakeReplaceAll(msgData, match, `<a href="${match}" class="btn-link BlueText" target="_blank">${match}</a>`)
        }
      })
    }
    data.msg = msgData
    this.data = data
  }

  addDataOtherObject (obj: IMsgInsecureSpecialData) {
    this.data.other += obj.getHtml()
  }

  addDisplayableFile (file: File) {
    const a = file.name.toLocaleLowerCase()
    if (isMedia.isImage(a)) {
      this.addDatabObjToElement(file, 'image')
    } else if (isMedia.isVideo(a)) {
      this.addDatabObjToElement(file, 'video')
    } else if (isMedia.isAudio(a)) {
      this.addDatabObjToElement(file, 'audio')
    }
  }

  addDataFileObject (obj: ComponentFactory<ChatMessageFileObjectComponent>) {
    if (!this.useOtherObjs) { this.useOtherObjs = true }
    if (this.otherData) {
      const o = this.otherData.createComponent<ChatMessageFileObjectComponent>(obj)
      o.instance.downloadClick.on('finished', (datablob) => {
        if (datablob instanceof Blob) {
          const type = datablob.type.split('/')
          this.addDatabObjToElement(datablob, type[0])
          o.destroy()
        }
      })
      return o
    }
    return undefined
  }

  /**
   * Creates an html element and adds data to it
   * @param blob data to add
   * @param type type of html element to create
   */
  public addDatabObjToElement (blob: any, type: string) {
    const cpy = this.data
    const t = type
    const reader = new FileReader()
    reader.onload = d => {
      const url = d.target?.result
      // let url = window.URL.createObjectURL(datablob);
      switch (t) {
        case 'image':
          cpy.other += `<img src="${url}" class="MsgContent mt-1 mb-1"></img>`
          break
        case 'video':
          cpy.other += `<video src="${url}" class="MsgContent mt-1 mb-1" controls></video>`
          break
        case 'audio':
          cpy.other += `<audio src="${url}" class="MsgContent mt-1 mb-1" controls></audio>`
          break
        default:
          // window.URL.revokeObjectURL(url);
          break
      }
      this.ref.detectChanges()
    }
    reader.readAsDataURL(blob)
  }

  private static escapeHtml (s:string):string {
    return s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&#34;')
  }

  private static fakeReplaceAll (s:string, olds:string, news:string):string {
    return s.split(olds).join(news)
  }
}
