import { Directive, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[userArea]'
})
export class UserHolderDirective {
  public viewContainerRef: ViewContainerRef
  constructor (viewContainerRef: ViewContainerRef) {
    this.viewContainerRef = viewContainerRef
  }
}
