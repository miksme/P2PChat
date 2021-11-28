import { Component, OnInit, ViewEncapsulation } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-modal-prefab',
  templateUrl: './modal-prefab.component.html',
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./modal-prefab.component.css']
})
export class ModalPrefabComponent implements OnInit {
  private modalService: NgbModal
  constructor (modalService: NgbModal) {
    this.modalService = modalService
  }

  ngOnInit (): void {
  }

  openModal (content:any):void {
    this.modalService.open(content)
  }
}
