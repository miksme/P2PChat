import { Directive, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[modalArea]'
})
export class ModalDirective {
  public viewContainerRef: ViewContainerRef
  constructor (viewContainerRef: ViewContainerRef) {
    this.viewContainerRef = viewContainerRef
  }
}
