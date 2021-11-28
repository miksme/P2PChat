import { Directive, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[videoArea]'
})
export class VideoHolderDirective {
  public viewContainerRef: ViewContainerRef
  constructor (viewContainerRef: ViewContainerRef) {
    this.viewContainerRef = viewContainerRef
  }
}
