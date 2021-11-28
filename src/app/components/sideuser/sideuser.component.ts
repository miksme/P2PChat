import { EventEmitter } from 'eventemitter3'
import { Component, Input, OnInit } from '@angular/core'
import { SysConfig } from './../../config/config'
@Component({
  selector: 'app-sideuser',
  templateUrl: './sideuser.component.html',
  styleUrls: ['./sideuser.component.css']
})
export class SideuserComponent extends EventEmitter implements OnInit {
  config = SysConfig
  @Input() data:{user: string, id:string, pfpLoc:string} = { user: 'ERROR', id: 'Network error', pfpLoc: '' }
  openContextMenu (e: MouseEvent) {
    e.preventDefault()
    const origin = {
      left: e.pageX,
      top: e.pageY
    }
    this.emit('contextMenu', origin)
    return false
  }

  ngOnInit (): void {
  }

  changeData (username: string, ID:string, pfpLoc:string) {
    this.data = { user: username, id: ID, pfpLoc: pfpLoc }
  }
}
