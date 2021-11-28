### Server to client and back
#### User creates a room
```txt
CREATE_ROOM(user) ->  CREATE_ROOM(server -> user) OR ERROR(server -> user) 
UPDATE_ROOM(user) ->  UPDATE_ROOM(server -> user) OR ERROR(server -> user) 
JOIN_ROOM(user)   ->  ERROR(server -> user) OR
                      JOIN_ROOM(server -> user) AND
                      JOIN_ROOM(server -> other users)
SIGNAL(user)      ->  SIGNAL(server -> other user)
GET_ID(user)      ->  GET_ID(server -> user)
```

#### User to server data types
```ts
GET_ID(user) = {requestId: string}
SIGNAL(user) = {source: string, target:string, room:string ,signal:any}
CREATE_ROOM(user) = {requestId: string, maxUsers: number, name: string, password:string, type: RoomType}  
JOIN_ROOM(user) = {requestId: string, room: string, password: string}  
UPDATE_ROOM(user) = {requestId: string, room: string, maxUsers: number, name: string, password:string}  
DISCONNECT(user) = string
```
#### Server to user data types
```ts
CREATE_ROOM(server) = {roomID:string, requestID: string, password: string,name:string, maxUsers:number,curUsers:number}  
JOIN_ROOM(server -> requester) = {requestID: string, name:string, maxUsers:number,curUsers:number, type: RoomType, spec:any}
JOIN_ROOM(server -> all other room users) = {from: {userID: string, roomID: string}}
UPDATE_ROOM(server) = {requestID: string,password: string, name:string, maxUsers:number,curUsers:number}
SIGNAL(server) = {source: string, target:string, room:string ,signal:any}
ERROR(server) = {requestID: string, error: Errors}

```
#### Local socket emitted events
Data that is received from the server for local processing
```txt
SignalingEvents.ROOM = {
    ID: string;
    pwd: string;
    name: string;
    maxUsers: number;
    type: RoomType;
    special: any;
}
SignalingEvents.NEWUSER = { base: string, ID: string }
SignalingEvents.ROOM_ERROR = { msg: string, target: undefined }
SignalingEvents.DISCONNECT = { ID: string, room: string }
SignalingEvents.SIGNAL = {
    source: string;
    target: string;
    room: string;
    signal: any;
}
```
