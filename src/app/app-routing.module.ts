import { NgModule } from '@angular/core'
import { Routes, RouterModule } from '@angular/router'

import { ChatComponent } from './components/chat/chat.component'

const routes: Routes = [
  { path: '', component: ChatComponent, pathMatch: 'full' },
  { path: 'chat', component: ChatComponent }
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
