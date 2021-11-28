import { Directive, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[thisUser]'
})
export class ThisUserDirective {
  public viewContainerRef: ViewContainerRef
  constructor (viewContainerRef: ViewContainerRef) {
    this.viewContainerRef = viewContainerRef
  }
}
