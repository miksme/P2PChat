### New user joins a room
### Sequence used to connect a remote user to a local one 
#### Mesh-type
```txt
1. Signaling socket receives info about new user
2. Create a new peer for sending the intial signal
3. Send intial "offer" request
      SignalingEvents.SIGNAL(thisUser) -> SignalingEvents.SIGNAL(newUser)
4. Receive an "answer"
      SignalingEvents.SIGNAL(newUser) -> SignalingEvents.SIGNAL(thisUser)
5. Send and receive udps/ renegotiates
6. Establish a WebRTC connection
7. Receive a InternalRoomEvents.id from remote user
8. If passwords match send own InternalRoomEvents.id to remote peer
   Otherwise close the connection
9. User has been connected
```
#### SFU-type
##### SFU Host
```txt
1. Signaling socket receives info about new user
2. Create a new peer for sending the intial signal along with a new ID for user
3. Send intial "offer" request
      SignalingEvents.SIGNAL(thisUser) -> SignalingEvents.SIGNAL(newUser)
4. Receive an "answer"
      SignalingEvents.SIGNAL(newUser) -> SignalingEvents.SIGNAL(thisUser)
5. Send and receive udps/ renegotiates
6. Establish a WebRTC connection
7. Receive a InternalRoomEvents.initialId from remote user
8. If passwords match send own InternalRoomEvents.initialId to remote peer
   Otherwise close the connection
9. Receive a InternalRoomEvents.id from remote user
10. Send info about all users (InternalRoomEvents.id)
9. User has been connected
```
##### SFU Client
```txt
1. Local user receives info about a new user (InternalRoomEvents.newUserInfo) from SFU host 
2. User has been added
```
