import { BrowserModule } from '@angular/platform-browser'
import { NgModule } from '@angular/core'

import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { ChatMessageComponent } from './components/chat-message/chat-message.component'
import { ChatComponent } from './components/chat/chat.component'
import { MsgDirective } from './directives/msg.directive'
import { FormsModule } from '@angular/forms'
import { VideoContainerComponent } from './components/video-container/video-container.component'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ModalPrefabComponent } from './components/modal-prefab/modal-prefab.component'
import { StartingSequenceComponent, InfoScreenModalComponent, UsernameFormContent, DecideRoomContent, CreateRoomContent, JoinRoomContent } from './components/starting-sequence/starting-sequence.component'
import { ModalDirective } from './directives/modal.directive'
import { SideuserComponent } from './components/sideuser/sideuser.component'
import { ThisUserDirective } from './directives/this-user.directive'
import { UserHolderDirective } from './directives/user-holder.directive'
import { VideoHolderDirective } from './directives/video-holder.directive'
import { FileDndDirective } from './directives/file-dnd.directive'
import { ChatMessageFileObjectComponent } from './components/chat-message-file-object/chat-message-file-object.component'
// import { InfoScreenModalComponent } from './components/info-screen-modal/info-screen-modal.component';

@NgModule({
  declarations: [
    AppComponent,
    ChatComponent,
    MsgDirective,
    ChatComponent,
    VideoContainerComponent,
    ModalPrefabComponent,

    InfoScreenModalComponent,
    UsernameFormContent,
    DecideRoomContent,
    CreateRoomContent,
    JoinRoomContent,
    StartingSequenceComponent,

    ModalDirective,
    SideuserComponent,
    ThisUserDirective,
    UserHolderDirective,
    VideoHolderDirective,
    FileDndDirective,
    ChatMessageFileObjectComponent
  ],
  entryComponents: [ChatMessageComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    NgbModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
