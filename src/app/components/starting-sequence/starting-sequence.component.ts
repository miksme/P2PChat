import { Component, ViewEncapsulation, OnInit } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { EventEmitter } from 'eventemitter3'
import { JSONparse } from '../../helpers/JSONparse'
import { userInput } from '../../helpers/objectInterfaces'
import { UserConfig } from 'src/app/config/config'

@Component({
  selector: 'app-starting-sequence',
  template: '',
  encapsulation: ViewEncapsulation.None
})
export class StartingSequenceComponent extends EventEmitter implements OnInit {
  userForm = {
    username: '',
    pfpLoc: '',
    autoDownload: false,
    autoDisplay: false
  }

  joinRoomForm = {
    ID: '',
    notpwd: ''
  }

  createRoomForm = {
    name: '',
    pwd: '',
    maxUsers: 2
  }

  actC: any
  constructor (private modalService: NgbModal) {
    super()
  }

  ngOnInit (): void {

  }

  showStart (): void {
    if (UserConfig.storageEnabled) {
      const a = localStorage.getItem('showInfoScreen')
      if (a !== 'no') {
        this.openStaticCenteredModal(InfoScreenModalComponent)
      } else {
        this.showUsername()
      }
    } else {
      this.openStaticCenteredModal(InfoScreenModalComponent)
    }
  }

  private showUsername (): void {
    this.openStaticCenteredModal(UsernameFormContent)
  }

  private showJoinRoom (): void {
    this.openStaticCenteredModal(JoinRoomContent)
  }

  private showCreateRoom (): void {
    this.openStaticCenteredModal(CreateRoomContent)
  }

  private getUserInfo (): void {
    this.emit('userForm', this.userForm)
  }

  private getCreateRoom (): void {
    if (this.createRoomForm.name.length > 0 && this.createRoomForm.name.length <= 20) {
      this.emit('createRoomForm', this.createRoomForm)
    }
  }

  private getJoinRoom (): void {
    this.emit('joinRoomForm', this.joinRoomForm)
  }

  giveCriticalError (text: string):void {
    this.modalService.dismissAll()
    const v = this.modalService.open(CriticalErrorContent, { size: 'lg', animation: true, windowClass: 'dark-modal', centered: true, keyboard: false, backdrop: 'static' })
    v.componentInstance.displayText(text)
  }

  giveNonCriticalError (text: string):void {
    this.modalService.dismissAll()
    const v = this.modalService.open(NonCriticalErrorContent, { size: 'lg', animation: true, windowClass: 'dark-modal', centered: true, keyboard: false, backdrop: 'static' })
    v.componentInstance.displayText(text)
    v.componentInstance.on('next', () => {
      this.showStart()
    })
  }

  giveCustomNonCriticalError (text: string, title: string, okButton?: string, cancelButton?: string):NonCriticalErrorContent {
    this.modalService.dismissAll()
    const v = this.modalService.open(NonCriticalErrorContent, { size: 'lg', animation: true, windowClass: 'dark-modal', centered: true, keyboard: false, backdrop: 'static' })
    v.componentInstance.displayText(text, title, okButton, cancelButton)
    v.componentInstance.on('next', () => {
      this.modalService.dismissAll()
    })
    v.componentInstance.on('cancel', () => {
      this.modalService.dismissAll()
    })
    return v.componentInstance
  }

  showRoomOptions (): void {
    this.openStaticCenteredModal(DecideRoomContent)
  }

  dismissAll (): void {
    this.modalService.dismissAll()
  }

  sendError (er:any): void {
    try {
      this.actC.showError(er)
    } catch {}
  }

  openStaticCenteredModal (content: InfoScreenModalComponent|UsernameFormContent|DecideRoomContent|CreateRoomContent|JoinRoomContent|any) {
    this.modalService.dismissAll()
    // return this.modalService.open(this.createElement(content), {animation: true, centered: true, keyboard:false, backdrop:'static'})
    const v = this.modalService.open(content, { size: 'lg', animation: true, windowClass: 'dark-modal', centered: true, keyboard: false, backdrop: 'static' })
    this.actC = v.componentInstance
    const evH = v.componentInstance
    evH.on('UsernameFormContent', () => {
      if (UserConfig.storageEnabled) {
        localStorage.setItem('showInfoScreen', 'no')
      }
      this.openStaticCenteredModal(UsernameFormContent)
    })
    evH.on('CreateRoomContent', () => {
      this.openStaticCenteredModal(CreateRoomContent)
    })
    evH.on('JoinRoomContent', () => {
      this.openStaticCenteredModal(JoinRoomContent)
    })
    evH.on('DecideRoomContent', () => {
      this.openStaticCenteredModal(DecideRoomContent)
    })

    evH.on('userForm', (data:any) => {
      this.userForm = data
      this.getUserInfo()

      const url = new URL(window.location.href)
      const roomID = url.searchParams.get('room')
      const pwd = url.searchParams.get('pwd')
      if (roomID !== null && pwd !== null) {
        this.openStaticCenteredModal(JoinRoomContent);
        (this.actC as JoinRoomContent).request(roomID, pwd)
      } else {
        this.openStaticCenteredModal(DecideRoomContent)
      }
    })
    evH.on('createRoomForm', (data:any) => {
      this.createRoomForm = data
      this.getCreateRoom()
    })
    evH.on('joinRoomForm', (data:any) => {
      this.joinRoomForm = data
      this.getJoinRoom()
    })
  }
}

@Component({
  templateUrl: './usernameFormContent.html'
})
export class UsernameFormContent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) {
    super()
    if (UserConfig.storageEnabled) {
      const a = localStorage.getItem('userConfig')
      if (a && a !== '') {
        this.userForm = JSONparse.destringify(a)
        for (const k in UsernameFormContent.DefaultUserForm) {
          if (!Object.prototype.hasOwnProperty.call(this.userForm, k)) {
            this.userForm = UsernameFormContent.DefaultUserForm
            break
          }
        }
      }
    }
  }

  // A bad way to restore data
  public static DefaultUserForm: userInput = {
    // General
    username: UserConfig.defaultUsername,
    pfpLoc: UserConfig.defaultPfP,

    showPFPs: UserConfig.displayPfPs,
    displayLink: UserConfig.downloadLinks,
    displayUserContent: UserConfig.displayContentFromUsers,
    autoDownloadUserContent: UserConfig.downloadDisplayableContentFromUsers,

    // File tranfer
    allowFileTransfer: true,
    maxActiveFileActions: UserConfig.maxActiveFileActions,
    fileTimeout: UserConfig.fileWaitingTimeoutInSeconds,
    accelerateLargeFileTranfer: UserConfig.useWorkersForFiles,
    largeFileBoundary: (UserConfig.fileSizeBoundaryForWorker / 1024) / 1024,
    peersPerLargeDownload: UserConfig.fileWorkerPeerAmount,
    scalePeerAmount: false,

    // Network config
    useSTUN: true,
    useCustomSTUN: false,
    customSTUN: 'dnu',
    customSTUNurl: '', // Actual user input

    useTURN: true,
    useCustomTURN: false,
    customTURN: 'dnu',
    customTURNurl: '', // Actual user input
    customTURNuser: '',
    customTURNpwd: '',

    // Other
    saveUserConfig: UserConfig.saveUserConfig
  } as const

  // A bad way to convert from user form input to UserConfig, does not really matter whats in here since it will be overwritten by default unless user has saved settings
  userForm:userInput = {
    // General
    username: '',
    pfpLoc: '',

    showPFPs: true,
    displayLink: false,
    displayUserContent: false,
    autoDownloadUserContent: false,

    // File tranfer
    allowFileTransfer: true,
    maxActiveFileActions: 8,
    fileTimeout: 60,
    accelerateLargeFileTranfer: true,
    largeFileBoundary: 30,
    peersPerLargeDownload: 1,
    scalePeerAmount: false,

    // Network config
    useSTUN: true,
    useCustomSTUN: false,
    customSTUN: 'dnu',
    customSTUNurl: '', // Actual user input

    useTURN: true,
    useCustomTURN: false,
    customTURN: 'dnu',
    customTURNurl: '', // Actual user input
    customTURNuser: '',
    customTURNpwd: '',

    // Other
    saveUserConfig: true
  }

  close () {
    this.activeModal.close()
  }

  isValidInfo ():boolean {
    let isValid = true
    if (this.userForm.username.length < 3 || this.userForm.username.length > 20) isValid = false
    if (this.userForm.maxActiveFileActions < 2 || this.userForm.maxActiveFileActions > 20) isValid = false
    if (this.userForm.largeFileBoundary < 10 || this.userForm.largeFileBoundary > 250) isValid = false
    if (this.userForm.peersPerLargeDownload < 1 || this.userForm.peersPerLargeDownload > 20) isValid = false

    if (this.userForm.useCustomSTUN && this.userForm.customSTUNurl === '') isValid = false

    if (this.userForm.useCustomTURN && this.userForm.customTURNurl === '') isValid = false

    return isValid
  }

  resetConfig () {
    this.userForm = UsernameFormContent.DefaultUserForm
  }

  resetStorage () {
    if (UserConfig.storageEnabled) { localStorage.clear() }
    window.location.reload()
  }

  getUserInfo () {
    if (this.userForm.saveUserConfig) { localStorage.setItem('userConfig', JSONparse.stringify(this.userForm)) }
    if (this.userForm.useSTUN && this.userForm.useCustomSTUN) {
      const a = { urls: 'stun:' + this.userForm.customSTUNurl }
      if (this.userForm.customSTUNurl.startsWith('stun:')) {
        a.urls = this.userForm.customSTUNurl
      }
      this.userForm.customSTUN = a
    }
    if (this.userForm.useTURN && this.userForm.useCustomTURN) {
      const a = { urls: 'turn:' + this.userForm.customTURNurl, username: this.userForm.customTURNuser, credential: this.userForm.customTURNpwd }
      if (this.userForm.customTURNurl.startsWith('turn:')) {
        a.urls = this.userForm.customTURNurl
      }
      this.userForm.customTURN = a
    }
    if (!this.userForm.allowFileTransfer) {
      this.userForm.peersPerLargeDownload = 0
      this.userForm.maxActiveFileActions = 0
      this.userForm.accelerateLargeFileTranfer = false
    }
    this.emit('userForm', this.userForm)
  }
}

@Component({
  templateUrl: './decideRoomContent.html'
})
export class DecideRoomContent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) { super() }
  showJoinRoom () {
    this.emit('JoinRoomContent')
  }

  showCreateRoom () {
    this.emit('CreateRoomContent')
  }
}

@Component({
  templateUrl: './createRoomContent.html'
})
export class CreateRoomContent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) { super() }
  createRoomForm = {
    name: '',
    pwd: '',
    maxUsers: 2,
    type: 0
  }

  hasError = false
  ErrorDesc = ''
  selectedRoomTypeText = 'P2P Mesh'
  close () {
    this.activeModal.close()
  }

  showRoomOptions () {
    this.close()
    this.emit('DecideRoomContent')
  }

  getCreateRoom () {
    this.emit('createRoomForm', this.createRoomForm)
  }

  changeRoomType (type: string) {
    this.createRoomForm.type = parseInt(type, 10)
  }

  showError (Er :any) {
    this.hasError = true
    this.ErrorDesc = Er
  }

  generatePassword () {
    this.createRoomForm.pwd = this.generateId(32)
  }

  // dec2hex :: Integer -> String
  // i.e. 0-255 -> '00'-'ff'
  private dec2hex (dec:number) {
    return dec.toString(16).padStart(2, '0')
  }

  private dec2str (dec:number) {
    return String.fromCharCode(dec)
  }

  // generateId :: Integer -> String
  private generateId (len:number, mode:'str'|'hex'|'base64' = 'base64') {
    const arr = new Uint8Array(len)
    window.crypto.getRandomValues(arr)
    let pwd = ''
    switch (mode) {
      case 'str':
        pwd = Array.from(arr, this.dec2str).join('')
        break
      case 'hex':
        pwd = Array.from(arr, this.dec2hex).join('')
        break
      case 'base64':
        pwd = Buffer.from(Array.from(arr, this.dec2hex).join(''), 'hex').toString('base64')
        break
    }
    if (pwd.length > 32) {
      pwd = pwd.substring(0, 32)
    }
    return pwd
  }
}

@Component({
  templateUrl: './joinRoomContent.html'
})
export class JoinRoomContent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) { super() }
  joinRoomForm = {
    ID: '',
    pwd: ''
  }

  hasError = false
  ErrorDesc = ''
  close () {
    this.activeModal.close()
  }

  request (ID: string, pwd: string) {
    this.joinRoomForm.ID = ID
    this.joinRoomForm.pwd = pwd
    setTimeout(() => {
      this.getJoinRoom()
    }, 300)
  }

  showRoomOptions () {
    this.close()
    this.emit('DecideRoomContent')
  }

  getJoinRoom () {
    this.emit('joinRoomForm', this.joinRoomForm)
  }

  showError (Er :any) {
    this.hasError = true
    this.ErrorDesc = Er
  }
}

@Component({

  templateUrl: './infoScreenModalComponent.html'
})
export class InfoScreenModalComponent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) { super() }

  showUsername () {
    this.emit('UsernameFormContent')
  }
}

@Component({
  templateUrl: './criticalErrorContent.html'
})
export class CriticalErrorContent {
  _innerText = ''
  displayText (text:string):void {
    this._innerText = text
  }
}
@Component({
  templateUrl: './nonCriticalErrorContent.html'
})
export class NonCriticalErrorContent extends EventEmitter {
  constructor (public activeModal: NgbActiveModal) { super() }
  _innerText = ''
  _okButton = 'Ok :('
  _cancelBtn: string|undefined = undefined
  _title = 'Self test result'
  displayText (text:string, title?: string, okBtn?:string, cancelBtn?:string):void {
    this._innerText = text
    if (title) { this._title = title }
    if (okBtn) { this._okButton = okBtn }
    if (cancelBtn) { this._cancelBtn = cancelBtn }
  }

  nextPage () {
    this.emit('next')
  }

  cancel () {
    this.emit('cancel')
  }
}
