import { Directive, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[msgArea]'
})
export class MsgDirective {
  public viewContainerRef: ViewContainerRef
  constructor (viewContainerRef: ViewContainerRef) {
    this.viewContainerRef = viewContainerRef
  }
}
