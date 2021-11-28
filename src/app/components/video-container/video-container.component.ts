import { SysConfig } from './../../config/config'
import { Component, Output, ViewChild, ElementRef } from '@angular/core'
import { EventEmitter } from 'eventemitter3'
import { ChannelUser } from 'src/app/helpers/user'

export enum VideoContainerSignals {
  GetStream = 'gstream',
  EndStream = 'estream'
}
@Component({
  selector: 'app-video-container',
  templateUrl: './video-container.component.html',
  styleUrls: ['./video-container.component.css']
})
export class VideoContainerComponent {
  @ViewChild('videoPlayer') videoPlayer: ElementRef|undefined

  @Output() events = new EventEmitter<any>()

  config = SysConfig

  streamActive = false
  closingActive = false
  forcedStream = false
  spamCounter = 0
  vidObj: MediaStream|undefined
  vidID = ''
  user: ChannelUser = new ChannelUser('Unknown', 'Error')

  forcedDisplay = 'block'
  muteStream = false
  /** background-image: url({{config.DEFAULT_PFP_LOC}}); */
  videoHeight = '180px'
  videoWidth = '320px'

  openContextMenu (e: MouseEvent) {
    e.preventDefault()
    const origin = {
      left: e.pageX,
      top: e.pageY
    }
    this.events.emit('contextMenu', origin)
    return false
  }

  Hide () {
    this.forcedDisplay = 'none'
  }

  Show () {
    this.forcedDisplay = 'block'
  }

  /**
   * Does not close the stream. Just creates a timeout that calls the actual "please close this stream" func
   */
  StopWatching () {
    if (!this.forcedStream) {
      this.streamActive = false
      if (!this.closingActive && this.vidObj) {
        this.closingActive = true
        this.spamCounter = 0
        setTimeout(() => {
          this._closeStream()
        }, 10000)
      } else {
        this.spamCounter++
      }
    }
  }

  StartWatching () {
    this.streamActive = false
    if (this.vidObj === undefined) {
      this.events.emit(VideoContainerSignals.GetStream, this.vidID)
    } else {
      this.streamActive = true
    }
  }

  Terminate () {
    this.streamActive = false
    this.vidObj = undefined
  }

  ForceReload () {
    this.videoPlayer?.nativeElement.load()
  }

  SetVolume (volume: number) {
    if (this.videoPlayer) {
      this.videoPlayer.nativeElement.volume = volume / 100
    }
  }

  GetVolume () {
    if (this.videoPlayer) {
      return this.videoPlayer.nativeElement.volume * 100
    }
    return 0
  }

  SwitchMuteState () {
    if (this.muteStream) {
      this.UnmuteStream()
    } else {
      this.MuteStream()
    }
  }

  MuteStream () {
    this.muteStream = true
    if (this.videoPlayer) {
      this.videoPlayer.nativeElement.muted = true
    }
  }

  UnmuteStream () {
    this.muteStream = false
    if (this.videoPlayer) {
      this.videoPlayer.nativeElement.muted = false
    }
  }

  AddVideoStream (stream: MediaStream): void {
    this.vidObj = stream
    this.vidObj.onaddtrack = () => {
      this.videoPlayer?.nativeElement.load()
      const a = this.vidObj?.getVideoTracks().length
      if (a !== undefined && a > 0) {
        this.streamActive = true
      } else {
        this.streamActive = false
      }
    }
    this.vidObj.onremovetrack = () => {
      this.videoPlayer?.nativeElement.load()
      const a = this.vidObj?.getVideoTracks().length
      if (a !== undefined && a > 0) {
        this.streamActive = true
      } else {
        this.streamActive = false
      }
    }
    if (this.videoPlayer && this.muteStream) {
      this.videoPlayer.nativeElement.volume = 0
      this.videoPlayer.nativeElement.muted = true
    }
    const a = this.vidObj?.getVideoTracks().length
    if (a !== undefined && a > 0) {
      this.streamActive = true
    } else {
      this.streamActive = false
    }
  }

  AddMetadata (data:{user: ChannelUser|undefined, videoID:string, forcedStream:boolean}) {
    if (data.user) { this.user = data.user }
    this.forcedStream = data.forcedStream
    this.vidID = data.videoID
  }

  private _closeStream (): void {
    if (!this.streamActive && this.spamCounter < 2) {
      this.events.emit(VideoContainerSignals.EndStream, this.vidID)
      this.Terminate()
    }
    this.closingActive = false
  }
}
