import { Component, OnInit, Output } from '@angular/core'
import { EventEmitter } from 'eventemitter3'
import { FileDownloadState } from 'src/app/roomControl/file-management/fileDownloadState'
@Component({
  selector: 'app-chat-message-file-object',
  templateUrl: './chat-message-file-object.component.html',
  styleUrls: ['./chat-message-file-object.component.css']
})
export class ChatMessageFileObjectComponent implements OnInit {
  fileName = ''
  fileSize = ''
  allowDownload = true
  isDownloading = false
  btnMsg = 'Download'

  private stateMonitor: FileDownloadState|undefined
  @Output() downloadClick = new EventEmitter<any>()

  addData (fileName: string, fileSize: number, allowDownload = true) {
    this.fileName = fileName
    this.fileSize = ChatMessageFileObjectComponent.formatBytes(fileSize)
    this.allowDownload = allowDownload
    if (!allowDownload) {
      this.btnMsg = 'You already have this file'
    }
  }

  addStateMonitor (stateMonitor: FileDownloadState) {
    stateMonitor.on('state', (data:{text:string}) => {
      this.btnMsg = data.text
      this.downloadClick.emit('statechange')
    })
    stateMonitor.on('finished', (data:{success:boolean, blob:Blob|undefined, text:string}) => {
      this.isDownloading = false
      this.btnMsg = data.text
      if (data.blob !== undefined) {
        this.downloadClick.emit('finished', data.blob)
      }
      setTimeout(() => {
        this.downloadClick.emit('statechange')
        this.btnMsg = 'Download once again'
        this.allowDownload = true
      }, 2000)
      this.downloadClick.emit('statechange')
    })
    this.stateMonitor = stateMonitor
  }

  emitCancel () {
    this.isDownloading = false
    this.stateMonitor?.cancelDownload()
    this.downloadClick.emit('cancel')
    this.downloadClick.emit('statechange')
  }

  emitDownload () {
    this.allowDownload = false
    this.isDownloading = true
    this.btnMsg = 'Getting ready...'
    this.downloadClick.emit('download')
    this.downloadClick.emit('statechange')
  }

  ngOnInit (): void {
  }

  /**
     * format bytes
     * @param bytes (File size in bytes)
     * @param decimals (Decimals point)
     */
  public static formatBytes (bytes:number, decimals = 2) {
    if (bytes === 0) {
      return '0 Bytes'
    }
    const k = 1024
    const dm = decimals <= 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }
}
