import { DecodeStreamEvents } from './../../roomControl/stream-management/streamEvents'
import { Logger } from './../../helpers/logMsg'
import { FileData } from './../../helpers/fileData'
import { MsgData } from './../../helpers/msg'
import { ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, OnInit, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core'
import { userInput } from '../../helpers/objectInterfaces'
import { ThisUserDirective } from 'src/app/directives/this-user.directive'
import { UserHolderDirective } from 'src/app/directives/user-holder.directive'
import { VideoHolderDirective } from 'src/app/directives/video-holder.directive'
import { ModalDirective } from '../../directives/modal.directive'
import { MsgDirective } from '../../directives/msg.directive'

import { ChannelUser } from '../../helpers/user'

import { RoomCellPublicEvents } from 'src/app/helpers/RoomCell.enums'
import { RoomCellInterface } from 'src/app/interfaces/RoomCell.interface'

import { RoomMgr, RoomMgrEvents } from '../../roomControl/room-mgr'

import { ChatMessageComponent } from '../chat-message/chat-message.component'
import { SideuserComponent } from '../sideuser/sideuser.component'
import { StartingSequenceComponent } from '../starting-sequence/starting-sequence.component'
import { VideoContainerComponent, VideoContainerSignals } from '../video-container/video-container.component'

import streamsaver from 'streamsaver'

import { UserConfig, SysConfig } from './../../config/config'
import { ChatMessageFileObjectComponent } from '../chat-message-file-object/chat-message-file-object.component'
import { isMedia } from 'src/app/helpers/isMedia'

import { WritableStreamForImagesAndStuff } from 'src/app/roomControl/file-management/downloadToDisplay'

@Component({
  selector: 'app-chat',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {
  // Views
  @ViewChild(MsgDirective, { static: true }) _msgHolder: MsgDirective|undefined
  @ViewChild(ModalDirective, { static: true }) _modalHolder: ModalDirective|undefined
  @ViewChild(ThisUserDirective, { static: true }) _thisUser: ThisUserDirective|undefined
  @ViewChild(UserHolderDirective, { static: true }) _userHolder: UserHolderDirective|undefined
  @ViewChild(VideoHolderDirective, { static: true }) _videoHolder: VideoHolderDirective|undefined

  // Main components
  Mgr: RoomMgr|undefined
  msg = ''

  private msgArea: HTMLElement|null = null
  private msgSendArea: HTMLElement|null = null
  private modalArea: StartingSequenceComponent|undefined

  private msgVievContainerRef: ViewContainerRef|undefined
  private userVievContainerRef: ViewContainerRef|undefined
  private videoVievContainerRef: ViewContainerRef|undefined

  private localUserComponent: any
  // Arrays to store dynamic components
  // General components
  private IDtoUserComp: Map<string, any> = new Map()
  // Voice components
  private IDtoVideoContainer: Map<string, Map<string, ComponentRef<VideoContainerComponent>>> = new Map() // Where Map<UserID, Map<TrackID, object>>

  // User info
  private id = ''
  // Condition info
  // Checks whenever this user is in current rooms call
  IsInLocalCall = false
  AreOthersInLocalCall = false
  IsScreensharing = false
  callHasMic = false
  callHasCam = false
  currentScreenshareID = ''
  constructor (private _cmpFctryRslvr: ComponentFactoryResolver, private ref: ChangeDetectorRef) {
    streamsaver.mitm = `http${SysConfig.RUN_HTTPS ? 's' : ''}://${SysConfig.HOSTNAME}/mitm.html`
  }

  ngOnInit (): void {
    this.msgArea = document.getElementById('msgArea')
    this.msgSendArea = document.getElementById('msgSendArea')

    document.title = 'P2P Chat ' + SysConfig.VERSION

    this.getViewContainers()
    UserConfig.storageEnabled = this.testLocalStorage()
    UserConfig.webrtcEnabled = RoomMgr.WEBRTC_SUPPORT
    UserConfig.webworkersEnabled = typeof Worker !== 'undefined'

    this.initModalData()
    if (!UserConfig.webrtcEnabled) {
      this.modalArea?.giveCriticalError('WebRTC not accesible: cannot use basic functionality')
    } else {
      let errMsg = ''
      if (!UserConfig.storageEnabled) {
        errMsg += 'localStorage not accesible: cannot save user config'
      }
      if (!UserConfig.webworkersEnabled) {
        errMsg += 'Web workers not accesible: switching to fallback...browser may use a lot more RAM'// " switching to fallback, max file size: 100MB"
        /* if(!window.Blob|| !window.Blob.prototype.arrayBuffer){
          errMsg+="Blob not accesible: file functionality disabled"
        } */
      }
      if (errMsg !== '') {
        this.modalArea?.giveNonCriticalError(errMsg)
      } else {
        this.modalArea?.showStart()
      }
    }
    // this.GetInitialBounds();
  }

  private testLocalStorage () {
    const test = 'test'
    try {
      localStorage.setItem(test, test)
      if (localStorage.getItem(test) === test) {
        localStorage.removeItem(test)
        return true
      }localStorage.removeItem(test)
    } catch (e) {}
    return false
  }

  private getViewContainers () {
    if (this._msgHolder) { this.msgVievContainerRef = this._msgHolder.viewContainerRef }
    if (this._userHolder) { this.userVievContainerRef = this._userHolder.viewContainerRef }
    if (this._videoHolder) { this.videoVievContainerRef = this._videoHolder.viewContainerRef }
  }

  private initModalData () {
    const a = this._cmpFctryRslvr.resolveComponentFactory(StartingSequenceComponent)
    if (this._modalHolder) {
      const b = this._modalHolder.viewContainerRef.createComponent<StartingSequenceComponent>(a)
      this.modalArea = b.instance
      b.instance.on('userForm', (data:userInput) => {
        UserConfig.defaultUsername = data.username
        UserConfig.defaultPfP = data.pfpLoc

        UserConfig.displayPfPs = data.showPFPs
        UserConfig.downloadLinks = data.displayLink
        UserConfig.displayContentFromUsers = data.displayUserContent
        UserConfig.downloadDisplayableContentFromUsers = data.autoDownloadUserContent

        if (data.useSTUN) {
          if (data.customSTUN !== 'dnu') {
            UserConfig.STUNserver = [data.customSTUN]
          }
        } else {
          UserConfig.STUNserver = []
        }
        if (data.useTURN) {
          if (data.customTURN !== 'dnu') {
            UserConfig.TURNserver = [data.customTURN]
          }
        } else {
          UserConfig.TURNserver = []
        }

        if (!data.accelerateLargeFileTranfer) {
          data.largeFileBoundary = UserConfig.fileSizeBoundaryForWorker
        }
        UserConfig.useWorkersForFiles = data.accelerateLargeFileTranfer
        UserConfig.fileSizeBoundaryForWorker = data.largeFileBoundary * 1024 * 1024
        UserConfig.maxActiveFileActions = data.maxActiveFileActions
        UserConfig.fileWorkerPeerAmount = data.peersPerLargeDownload
        UserConfig.maxActiveSingleThreadFileActions = UserConfig.maxActiveFileActions / 2 >= 4 ? UserConfig.maxActiveFileActions / 2 : (UserConfig.maxActiveFileActions - (UserConfig.maxActiveFileActions >= 4 ? 2 : 1))
        UserConfig.fileWaitingTimeoutInSeconds = data.fileTimeout
        this.createMgr()
      })
      b.instance.on('joinRoomForm', (data:{ID: string, pwd: string}) => {
        this.LogMsg('Got event joinRoomForm')
        this.Mgr?.JoinRoom(data.ID, data.pwd)
      })
      b.instance.on('createRoomForm', (data:{name: string, pwd: string, maxUsers: number, type:number}) => {
        this.LogMsg('Got event createRoomForm')
        this.Mgr?.CreateRoom(data.pwd, data.name, data.maxUsers, data.type)
      })
    }
  }

  selectElementText (el:any, win:any) {
    win = win || window
    const doc = win.document; let sel; let range
    if (win.getSelection && doc.createRange) {
      sel = win.getSelection()
      range = doc.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    } else if (doc.body.createTextRange) {
      range = doc.body.createTextRange()
      range.moveToElementText(el)
      range.select()
    }
  }

  destroyPaste (ev: ClipboardEvent, obj:HTMLBodyElement) {
    ev.preventDefault()
    ev.stopPropagation()
    const data = ev.clipboardData?.getData('text')
    obj.innerText += data
    if (obj.textContent) {
      this.msg = obj.textContent
    }
  }

  typeKeyDown (event:KeyboardEvent) {
    if (this.Mgr?.CurrentOpenRoom) {
      if (event.key === 'Enter') {
        if (!event.shiftKey) {
          this.sendMsg()
          return false
        }
      }
    } return true
  }

  changeRoom (room: RoomCellInterface) {
    this.localUserComponent.changeData(room.roomCurrentUser.username, room.roomCurrentUser.id, room.roomCurrentUser.avatarLoc)
  }

  /**
   * Removed. Created to switch active rooms
   * @param room Room object
   */
  // changeCallRoom (room: RoomCellInterface) {
  //
  //  }

  detectLocalCall () {
    this.IsInLocalCall = (this.Mgr?.CurrentOpenRoom?.roomID === this.Mgr?.CurrentOpenCallRoom?.roomID)
  }

  createMgr () {
    try {
      if (RoomMgr.WEBRTC_SUPPORT) {
        this.Mgr = new RoomMgr(new ChannelUser(UserConfig.defaultUsername, ':)', UserConfig.defaultPfP))
        this.localUserComponent = this._thisUser?.viewContainerRef.createComponent<SideuserComponent>(this._cmpFctryRslvr.resolveComponentFactory(SideuserComponent)).instance
        this.localUserComponent.changeData(UserConfig.defaultUsername, ':)', UserConfig.defaultPfP)
        this.localUserComponent.on('contextMenu', (data:{left: number, top: number}) => {
          const a = this.Mgr?.CurrentOpenRoom?.userID
          if (a) { this.openContextMenu(data, a) }
        })
        this.Mgr.on(RoomMgrEvents.RoomChanged, () => {
          this.modalArea?.dismissAll()
          const a = this.Mgr?.CurrentOpenRoom
          if (a) {
            this.detectLocalCall()
            this.changeRoom(a)
          }
        })
        this.Mgr.on(RoomMgrEvents.VoiceRoomChanged, () => {
          const a = this.Mgr?.CurrentOpenCallRoom
          if (a) {
            this.detectLocalCall()
            // this.changeCallRoom(a)
          }
        })
        this.Mgr.on(RoomMgrEvents.RoomConnectionError, (data:{msg:string, ID:string}) => {
          this.modalArea?.sendError(data.msg)
        })

        this.Mgr.on(RoomCellPublicEvents.newMessage, (data:MsgData) => {
          const usr = this.Mgr?.CurrentOpenRoom?.users.get(data.id)
          if (usr) {
            this.addMsgWithFile(usr.username, data.msg, data.id, usr.avatarLoc, '', data.additionalContent)
          }
        })
        this.Mgr.on(RoomCellPublicEvents.userJoins, (data:ChannelUser) => {
          this.addUser(data)
        })
        this.Mgr.on(RoomCellPublicEvents.userLeaves, (data:ChannelUser) => {
          this.LogMsg('Removing user ' + data.id)
          this.removeUser(data.id)
          this.checkIfOthersInCall()
        })
        this.Mgr.on(RoomCellPublicEvents.userUpdates, (data:ChannelUser) => {
          this.updateUser(data)
        })
        this.Mgr.on(RoomCellPublicEvents.userJoinsCall, (_data:any) => {
          const data = DecodeStreamEvents.newUser(_data)
          this.newCallUser(data)
          this.checkIfOthersInCall()
          this.LogMsg('Adding call user ' + data + ' ' + (this.AreOthersInLocalCall === true))
        })
        this.Mgr.on(RoomCellPublicEvents.userLeavesCall, (_data:any) => {
          const data = DecodeStreamEvents.lostUser(_data)
          this.removeCallUser(data)
          this.checkIfOthersInCall()
        })
        this.Mgr.on(RoomCellPublicEvents.userAddsVideoStream, (_data:any) => {
          const data = DecodeStreamEvents.updatedStreamInfo(_data)
          if (this.IsInLocalCall) {
            this.addVideoContainerOfUser(data.userID, data.possibilities, data.primaryStream)
          }
        })
        this.Mgr.on(RoomCellPublicEvents.recvVideoStream, (_data:any) => {
          const data = DecodeStreamEvents.gainedStream(_data)
          if (!this.IDtoVideoContainer.has(data.userID)) {
            this.IDtoVideoContainer.set(data.userID, new Map())
          }
          this.LogMsg(`Adding stream data ${data.stream.id} from ${data.userID}`)
          const isLocal = this.Mgr?.CurrentOpenCallRoom?.userID === data.userID
          if (this.IDtoVideoContainer.get(data.userID)?.has(data.stream.id)) {
            const videoTrack: MediaStream|undefined = data.stream
            if (videoTrack) {
              this.IDtoVideoContainer.get(data.userID)?.get(data.stream.id)?.instance.AddVideoStream(videoTrack)
            }
          } else {
            this.addVideoContainer(data.userID, data.stream.id, isLocal ? true : data.stream.id === this.Mgr?.CurrentOpenCallRoom?.call.getRemoteStreamInfo(data.userID)?.primaryStream)
          }
        })
        this.Mgr.on(RoomCellPublicEvents.remvVideoStream, (_data:any) => {
          const data = DecodeStreamEvents.lostStream(_data)
          this.removeVideoContainer(data.userID, data.streamID)
        })
      } else {
        this.modalArea?.giveCriticalError('Your browser does not support WebRTC')
      }
    } catch (e) {
      this.modalArea?.giveCriticalError('Failed to initialize')
    }
  }

  /*
    Chatting stuff
  */
  sendMsg () {
    this.msg = this.msg.trim()
    if (this.msg.length > 2000) {
      this.msg = this.msg.slice(0, 2000)
    }
    const a = this.Mgr?.CurrentOpenRoom
    if (this.msg.startsWith('/debug')) {
      const variables = this.msg.split(' ')
      switch (variables[1]) {
        case 'download':
          this.downloadFile(variables[2], variables[3], undefined)
          break
        case 'upload':
          {
            const file = new File(['123456789'], 'test.1.txt')
            this.uploadFile(file)
          }
          break
      }
    } else if (a && this.msg !== '') {
      const fdata: FileData[] = []
      this.nextMsgFiles.forEach(file => {
        const a = this.Mgr?.CurrentOpenRoom?.files.addLocalFile(file)
        if (a) {
          fdata.push(a)
        }
      })
      this.addMsgWithFile(a.roomCurrentUser.username, this.msg, a.roomCurrentUser.id, a.roomCurrentUser.avatarLoc, '', fdata)
      if (fdata.length > 0) {
        a.sendMsg(this.msg, fdata)
        this.nextMsgFiles = []
      } else {
        a.sendMsg(this.msg)
      }
    }
    this.msg = ''
    if (this.msgSendArea) { this.msgSendArea.textContent = this.msg }
  }

  removeAttachedFiles () {
    this.nextMsgFiles = []
  }

  addMsgWithFile (auth: string, msg: string, id:string, pfpLoc:string, special: string, files?: FileData[]) {
    const obj = this.addMsg(auth, msg, id, pfpLoc, special)
    if (obj) {
      const isLocal = (id === this.Mgr?.CurrentOpenRoom?.userID)
      if (isLocal && UserConfig.downloadDisplayableContentFromUsers) { // A bad impl but i just dont care
        this.nextMsgFiles.forEach(file => {
          if (isMedia.isMedia(file.name) && file.size <= UserConfig.fileSizeBoundaryForWorker) {
            obj?.addDisplayableFile(file)
          } else {
            const c = this._cmpFctryRslvr.resolveComponentFactory(ChatMessageFileObjectComponent)
            const out = obj?.addDataFileObject(c)
            if (out) {
              out.instance.addData(file.name, file.size, !isLocal)
            }
          }
        })
      } else {
        files?.forEach(fdata => {
          if (!isLocal && UserConfig.downloadDisplayableContentFromUsers && isMedia.isMedia(fdata.FileName) && fdata.FileSize <= UserConfig.fileSizeBoundaryForWorker) {
            this.downloadFile(id, fdata.FileID, obj)
          } else {
            const c = this._cmpFctryRslvr.resolveComponentFactory(ChatMessageFileObjectComponent)
            const out = obj?.addDataFileObject(c)
            if (out) {
              out.instance.addData(fdata.FileName, fdata.FileSize, !isLocal)
              out.instance.downloadClick.on('download', () => { this.downloadFile(id, fdata.FileID, out?.instance) })
              // out.instance.downloadClick.on('cancel', () => { }) TODO, for now ChatMessageFileObjectComponent itself cancels it
              out.instance.downloadClick.on('statechange', () => { this.ref.detectChanges() })
            }
          }
        })
      }

      this.ref.detectChanges()
    }
  }

  addMsg (auth: string, msg: string, id:string, pfpLoc:string, special: string):ChatMessageComponent | undefined {
    let specialV = ''
    // TODO should either implement or remove
    switch (special) {
      case 'private':
        specialV = '<span class="badge badge-secondary">Private</span>'
        break
      case 'server':
        specialV = '<span class="badge badge-secondary">Important</span>'
        break
    }
    if (!UserConfig.displayPfPs) {
      pfpLoc = SysConfig.DEFAULT_PFP_LOC
    }
    const c = this._cmpFctryRslvr.resolveComponentFactory(ChatMessageComponent)
    const d = this.msgVievContainerRef?.createComponent<ChatMessageComponent>(c)
    d?.instance.addDataManual(this.prepMsgData(auth, id, pfpLoc, msg, specialV), UserConfig.downloadLinks)
    this.ref.detectChanges()

    if (this.msgArea) {
      this.msgArea.scrollTop = this.msgArea.scrollHeight
    }
    return d?.instance
  }

  clearMsgs () {
    this.msgVievContainerRef?.clear()
  }

  private prepMsgData (auth:string, id:string, pfpLoc:string, msg:string, special:string): {user:string, msg:string, time:string, id:string, special:string, pfpLoc:string, other:string} {
    return {
      user: auth,
      msg: msg,
      special: special,
      time: new Date().toTimeString().split(' ')[0],
      id: id,
      pfpLoc: pfpLoc,
      other: ''
    }
  }

  addUser (user:ChannelUser) {
    if (!this.IDtoUserComp.get(user.id)) {
      if (!UserConfig.displayPfPs) {
        user.avatarLoc = SysConfig.DEFAULT_PFP_LOC
      }
      const c = this._cmpFctryRslvr.resolveComponentFactory(SideuserComponent)
      const d = this.userVievContainerRef?.createComponent<SideuserComponent>(c)
      d?.instance.changeData(user.username, user.id, user.avatarLoc)
      this.IDtoUserComp.set(user.id, d)
      d?.instance.on('contextMenu', (data:{left: number, top: number}) => {
        this.openContextMenu(data, user.id)
      })
    } else {
      this.updateUser(user)
    }
    this.ref.detectChanges()
  }

  updateUser (user:ChannelUser) {
    if (user.id !== this.Mgr?.CurrentOpenRoom?.userID) {
      this.IDtoUserComp.get(user.id)?.instance.changeData(user.username, user.id, user.avatarLoc)
    } else {
      this.localUserComponent.changeData(user.username, user.id, user.avatarLoc)
    }
  }

  removeUser (id: string) {
    this.IDtoUserComp.get(id)?.destroy()
    this.IDtoUserComp.delete(id)
    this.ref.detectChanges()
  }

  changeLocalUser () {
    this.localUserComponent.changeData(UserConfig.defaultUsername, ':)', UserConfig.defaultPfP)
    this.Mgr?.changeGlobalUser(new ChannelUser(UserConfig.defaultUsername, this.Mgr.socket.ID, UserConfig.defaultPfP))
  }

  /*
    File stuff
  */
  nextMsgFiles: File[] = []
  onFileDropped (fileList : FileList) {
    let remaining = 5 - this.nextMsgFiles.length
    if (remaining > fileList.length) {
      remaining = fileList.length
    }
    if (remaining > 0) {
      for (let i = 0; i < remaining; i++) {
        const file = fileList.item(i)
        if (file) {
          this.nextMsgFiles.push(file)
        }
      }
    }
  }

  downloadFile (UserID:string, FileID:string, Msg: ChatMessageFileObjectComponent|ChatMessageComponent|undefined) {
    const file = this.Mgr?.CurrentOpenRoom?.files.getRemoteFile(UserID, FileID)

    if (file) {
      if (UserConfig.displayContentFromUsers && isMedia.isMedia(file.FileName) && file.FileSize <= UserConfig.fileSizeBoundaryForWorker) {
        console.log('Display user content')
        const fakeFilestream = new WritableStreamForImagesAndStuff(isMedia.getMIME(file.FileName))
        const state = this.Mgr?.CurrentOpenRoom?.files.downloadFile(UserID, FileID, fakeFilestream)
        if (state) {
          if (Msg instanceof ChatMessageFileObjectComponent) {
            Msg.addStateMonitor(state)
          } else if (Msg instanceof ChatMessageComponent) {
            state.on('finished', (data:{success:boolean, blob:Blob|undefined, text:any}) => {
              console.log('special finished')
              console.log(data)
              if (data.blob !== undefined && data.success) {
                Msg.addDatabObjToElement(data.blob, data.blob.type.split('/')[0])
              }
            })
          }
        }
      } else {
        console.log('DONT display user content')
        const filestream = streamsaver.createWriteStream(file.FileName, {
          size: file.FileSize
        })
        if (filestream) {
          const state = this.Mgr?.CurrentOpenRoom?.files.downloadFile(UserID, FileID, filestream.getWriter())
          if (state && Msg instanceof ChatMessageFileObjectComponent) { Msg.addStateMonitor(state) }
        }
      }
    }
  }

  uploadFile (file:File) {
    return this.Mgr?.CurrentOpenRoom?.files.addLocalFile(file)
  }
  /*
    Voice stuff
  */

  micInProgress = false
  camInProgress = false
  scrInProgress = false

  HandleMicrophone () {
    const b = this.Mgr?.CurrentOpenCallRoom?.call.getMicState()
    if (!this.micInProgress && typeof b === 'boolean') {
      this.micInProgress = true
      this.Mgr?.CurrentOpenCallRoom?.turnOnMicrophone(!b).then(result => {
        const a = this.Mgr?.CurrentOpenCallRoom?.call.getMicState()
        if (result && typeof a === 'boolean') {
          this.callHasMic = a
        }
        this.micInProgress = false
      })
    }
  }

  HandleCamera () {
    const b = this.Mgr?.CurrentOpenCallRoom?.call.getCamState()
    if (!this.camInProgress && typeof b === 'boolean') {
      this.camInProgress = true
      this.Mgr?.CurrentOpenCallRoom?.turnOnCamera(!b).then(result => {
        const a = this.Mgr?.CurrentOpenCallRoom?.call.getCamState()
        if (result && typeof a === 'boolean') {
          this.callHasCam = a
        }
        this.camInProgress = false
      })
    }
  }

  HandleScreenshare () {
    const b = this.Mgr?.CurrentOpenCallRoom?.call.getScrState()
    if (!this.scrInProgress && typeof b === 'boolean') {
      this.scrInProgress = true
      this.Mgr?.CurrentOpenCallRoom?.screenShareWindow(!b).then(result => {
        const a = this.Mgr?.CurrentOpenCallRoom?.call.getScrState()
        if (result && typeof a === 'boolean') {
          this.IsScreensharing = a
        }
        this.scrInProgress = false
      })
    }
  }

  MakeCall (audio:boolean, video: boolean) {
    this.Mgr?.JoinCall(audio, video).then(() => {
      this.IsInLocalCall = true
      this.callHasCam = video
      this.callHasMic = audio
      this.Mgr?.CurrentOpenCallRoom?.call.getRemoteStreamInfos().forEach((value, key) => {
        this.addVideoContainerOfUser(key, value.streams, value.primaryStream)
      })
      const local = this.Mgr?.CurrentOpenCallRoom?.call.getLocalStreamInfo()
      const lID = this.Mgr?.CurrentOpenCallRoom?.userID
      if (lID && local) {
        this.addVideoContainerOfUser(lID, local.streams, local.primaryStream)
      }
    }).catch(() => {
      this.LogMsg('Failed to join call, giving options')
      if (this.modalArea) {
        const a = this.modalArea.giveCustomNonCriticalError('Could not get your microphone and/or camera. You can still try to connect without anything.', 'Failed to get access', 'Connect', 'Close')
        a.on('next', () => {
          this.Mgr?.JoinCall(false, false).then(() => {
            this.LogMsg('Connection successful')
            this.IsInLocalCall = true
            this.callHasCam = false
            this.callHasMic = false
            this.Mgr?.CurrentOpenCallRoom?.call.getRemoteStreamInfos().forEach((value, key) => {
              this.addVideoContainerOfUser(key, value.streams, value.primaryStream)
            })
            const local = this.Mgr?.CurrentOpenCallRoom?.call.getLocalStreamInfo()
            const lID = this.Mgr?.CurrentOpenCallRoom?.userID
            if (lID && local) {
              this.addVideoContainerOfUser(lID, local.streams, local.primaryStream)
            }
          }).catch(() => {
            this.LogMsg('Still failed to connect')
            this.modalArea?.giveCustomNonCriticalError('Connection still was not possbile.', 'Still failed', 'Close')
          })
        })
        a.on('cancel', () => {
          this.LogMsg('User decliened. Not doing anything.')
        })
        this.ref.detectChanges()
      }
    })
  }

  LeaveCall () {
    this.Mgr?.LeaveCall()
    this.IDtoVideoContainer.forEach((data, key) => {
      this.removeVideoContainer(key)
    })
    this.clearVideoContainers()
    this.IsInLocalCall = false
  }

  videoContainerActiveShowID = ''
  showContentOfUser (UserID:string) {
    this.videoContainerActiveShowID = UserID
    if (UserID === '') {
      for (const usr of this.IDtoVideoContainer) {
        usr[1].forEach(el => {
          el.instance.Show()
        })
      }
    } else {
      for (const usr of this.IDtoVideoContainer) {
        if (usr[0] === UserID) {
          usr[1].forEach(el => {
            el.instance.Show()
          })
        } else {
          usr[1].forEach(el => {
            el.instance.Hide()
          })
        }
      }
    }
    this.ref.detectChanges()
  }

  private newCallUser (UserID: string) {
    this.IDtoVideoContainer.set(UserID, new Map())
    // this.NewCallUserSet.add(UserID);
    this.ref.detectChanges()
  }

  private removeCallUser (UserID:string):void {
    this.removeVideoContainer(UserID)
    this.IDtoVideoContainer.delete(UserID)
    this.ref.detectChanges()
  }

  private addVideoContainer (ID:string, videoID: string, forced = false) {
    if (!this.IDtoVideoContainer.has(ID)) {
      this.IDtoVideoContainer.set(ID, new Map())
    }
    const a = this.videoVievContainerRef?.createComponent<VideoContainerComponent>(this._cmpFctryRslvr.resolveComponentFactory(VideoContainerComponent))
    if (a) {
      let usr = this.Mgr?.CurrentOpenCallRoom?.users.get(ID)
      if (ID === this.Mgr?.CurrentOpenCallRoom?.userID) {
        usr = this.Mgr.CurrentOpenCallRoom.roomCurrentUser
      }
      if (ID !== this.videoContainerActiveShowID && this.videoContainerActiveShowID !== '') {
        a.instance.Hide()
      }
      a.instance.events.on(VideoContainerSignals.GetStream, (vidID: string) => {
        this.Mgr?.CurrentOpenCallRoom?.requestStream(ID, vidID)
      })
      a.instance.events.on(VideoContainerSignals.EndStream, (vidID: string) => {
        this.Mgr?.CurrentOpenCallRoom?.removeStream(ID, vidID)
      })
      if (this.Mgr?.CurrentOpenCallRoom?.userID === ID) {
        a.instance.events.on('contextMenu', (data:{left: number, top: number}) => {
          this.openContextMenu(data, ID)
        })
        a.instance.MuteStream()
      } else {
        a.instance.events.on('contextMenu', (data:{left: number, top: number}) => {
          this.openContextMenu(data, ID, videoID)
        })
      }

      a.instance.AddMetadata({ user: usr, videoID: videoID, forcedStream: forced })
      this.IDtoVideoContainer.get(ID)?.set(videoID, a)
      if (forced) {
        a.instance.StartWatching()
      }
    }
    this.ref.detectChanges()
  }

  private removeVideoContainer (UserID: string, videoID = '') {
    if (videoID !== '') {
      this.IDtoVideoContainer.get(UserID)?.get(videoID)?.instance.Terminate()
      this.IDtoVideoContainer.get(UserID)?.get(videoID)?.destroy()
      if (this.videoContainerActiveShowID === UserID) {
        const a = this.Mgr?.CurrentOpenRoom?.userID
        this.showContentOfUser(a || '')
      }
      this.IDtoVideoContainer.get(UserID)?.delete(videoID)
    } else {
      this.IDtoVideoContainer.get(UserID)?.forEach(v => {
        v.instance.Terminate()
        v.destroy()
      })
      this.IDtoVideoContainer.delete(UserID)
    }
  }

  private clearVideoContainers () {
    this.videoVievContainerRef?.clear()
  }

  private checkIfOthersInCall () {
    const a = this.Mgr?.CurrentOpenRoom?.call.getRemoteStreamInfos().size
    if (a) {
      this.AreOthersInLocalCall = a > 0
    } else {
      this.AreOthersInLocalCall = false
    }
    this.ref.detectChanges()
  }

  getListWithoutLocal () {
    const localID = this.Mgr?.CurrentOpenRoom?.userID
    const a:([string, any])[] = []
    this.Mgr?.CurrentOpenRoom?.call.getRemoteStreamInfos().forEach((val, key) => {
      const b = this.Mgr?.CurrentOpenRoom?.users.get(key)
      if (key !== localID && b) {
        a.push([key, b.username])
      }
    })
    return a
  }

  addVideoContainerOfUser (UserID: string, Possibilities: Set<string>|undefined, primaryStream: string|undefined) {
    if (!this.IDtoVideoContainer.has(UserID)) {
      this.IDtoVideoContainer.set(UserID, new Map())
    }
    const IDContainerObj = this.IDtoVideoContainer.get(UserID)
    if (IDContainerObj) {
      Possibilities?.forEach(vidID => {
        if (!IDContainerObj?.has(vidID)) {
          this.addVideoContainer(UserID, vidID, primaryStream === vidID)
        }
      })
      IDContainerObj.forEach((val, key) => {
        if (!Possibilities?.has(key)) {
          this.removeVideoContainer(UserID, key)
        }
      })
    }
  }

  generateLink () {
    const a = new URL(window.location.href)
    {
      a.searchParams.set('room', '')
      const b = this.Mgr?.CurrentOpenRoom?.roomID
      if (b) {
        a.searchParams.set('room', b)
      }
    }
    {
      a.searchParams.set('pwd', '')
      const b = this.Mgr?.CurrentOpenRoom?.roomPWD
      if (b) {
        a.searchParams.set('pwd', b)
      }
    }
    this.copyText(a.href)
  }

  copyText (text: string) {
    const b = (document.getElementById('_copyText') as HTMLInputElement)
    b.value = text
    b.select()
    b.setSelectionRange(0, 99999)
    navigator.clipboard.writeText(b.value)
  }

  // They sure did make it hard to make context menus... or components
  // So im not going to bother and will just use pure-ish JS
  contextMenuOpened = false
  contextMenuSelectedUserID = '-1'
  contextMenuSelectedVideoID = '-1'
  contextMenuDisplayVideoStuff = false
  contextMenuSelectedContainer: VideoContainerComponent | undefined = undefined
  contextMenuMuteUser () {
    if (this.contextMenuSelectedContainer !== undefined) {
      this.contextMenuSelectedContainer.SwitchMuteState()
      const b = document.getElementById('contextMenuMute')
      if (b) {
        b.textContent = this.contextMenuSelectedContainer.muteStream ? 'Unmute' : 'Mute'
      }
    }
  }

  contextMenuChangeUserVolume () {
    if (this.contextMenuSelectedContainer !== undefined) {
      const b = document.getElementById('contextMenuVolume')
      if (b instanceof HTMLInputElement) {
        this.contextMenuSelectedContainer.SetVolume(parseInt(b.value))
      }
    }
  }

  contextMenuCopyID () {
    this.copyText(this.contextMenuSelectedUserID)
  }

  closeContextMenu () {
    if (this.contextMenuOpened) {
      const a = document.getElementById('contextMenu')
      if (a) {
        a.style.display = 'none'
        this.contextMenuOpened = false
      }
    }
  }

  openContextMenu (position: {left: number, top: number}, userID: string, streamID?: string) {
    const a = document.getElementById('contextMenu')
    if (a) {
      this.contextMenuOpened = true
      const maxRight = window.innerWidth - 320
      const maxBottom = window.innerHeight - 120
      if (position.left > maxRight) {
        a.style.left = `${maxRight}px`
      } else {
        a.style.left = `${position.left}px`
      }

      if (position.top > maxBottom) {
        a.style.top = `${maxBottom}px`
      } else {
        a.style.top = `${position.top}px`
      }
      a.style.display = 'block'

      this.contextMenuSelectedUserID = userID
      if (streamID) {
        this.contextMenuDisplayVideoStuff = true
        this.contextMenuSelectedVideoID = streamID
        const b = this.IDtoVideoContainer.get(this.contextMenuSelectedUserID)?.get(this.contextMenuSelectedVideoID)?.instance
        this.contextMenuSelectedContainer = b
        if (b !== undefined) {
          {
            const c = document.getElementById('contextMenuMute')
            if (c) {
              c.textContent = b.muteStream ? 'Unmute' : 'Mute'
            }
          }
          {
            const c = document.getElementById('contextMenuVolume')
            if (c instanceof HTMLInputElement) {
              c.value = `${b.GetVolume()}`
            }
          }
        }
      } else {
        this.contextMenuDisplayVideoStuff = false
      }
      this.ref.detectChanges()
    }
  }

  private LogMsg (msg: any) {
    Logger.Msg('Frontend chat', msg, 1)
  }
}
