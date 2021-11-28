import { Type } from '@angular/core'

export class MsgPrefab {
  public component: Type<any>
  public data: any
  constructor (component: Type<any>, data: any) {
    this.component = component
    this.data = data
  }
}
