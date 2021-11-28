import { Directive, Output, EventEmitter, HostListener } from '@angular/core'
@Directive({
  selector: '[InputOverload]'
})
export class InputDirective {
  @Output() textInput = new EventEmitter<any>()
  @Output() textKeyDown = new EventEmitter<any>()

  @HostListener('input', ['$event']) onInput (evt:any) {
    evt.preventDefault()
    evt.stopPropagation()
    this.textInput.emit(evt.target.textContent)
  }

  @HostListener('keydown', ['$event']) public onKeyDown (evt:any) {
    evt.preventDefault()
    evt.stopPropagation()
    this.textKeyDown.emit(evt)
  }
}
