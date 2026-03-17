- [x] QR
- [x] Better QR. Works but Do not apply night theme.
- [ ] Handle renegotiation, retry call
- [ ] Make the client PWA
- [ ] Improve UI for mobile screens.
- [x] The camera indicator is still on after peer disconnects. Properly release resources. Camera is still on the peer who didn't hangup the call first
- [x] UI improvement kun page ma xau tyo page ko button highlight
- [x] Why use url in avatar in HomePage:58? OR Use the first letter of the userName as capital and show it in avatar
- [ ] User ko data such as various server urls they entered is saved in indexedDB in plain text. encrypt it.
- [ ] able to import/export account
- [ ] List supported resolition. afaile arbitrary resolution set garne milne hoki number of supported resolution ho.
- [ ] List front and rear cameras in mobile phones.

# Before Presentation
- [ ] Check combination between ISPs. Contact them if needed.
- [ ] measure latency, bandwidth, connection establishment time, fps, resolution with direct P2P in LAN, WAN and with TURN relay.
- [ ] Implement authentication and security between signaling server and the clients.
- [ ] User lai public key le chinne. even in server. Maile kasaiko key aru bata liye vane usko name ma afno marji le rakhna sakxu(e.g. vai, uncle). server ma name check garnu thik xaina. public key le nai user lai uniqely identify garne.
- [ ] When relogging the key of the user is changed sometime. Happened on my phone.
- [x] make direct P2P possible anyhow.
- [x] Host signaling server on a public backend server.
- [x] use https and wss between server and client
- [x] Call aayo vanne indicator or page (only basic initially done)
- [x] Able to call a specific user.
- [x] Generate ECDSA key pair
- [x] store ECDSA key pair locally
- [x] Store other user's contact detail
- [x] Ability to add peaple(contacts). a page or form to enter other peoples key pair.
- [x] Secure the signaling process. Encrypt/decrypt offer and ice candidates between peers.
- [x] display stats such as bandwidth, bitrate, quality if possible
- [x] Login Page UI improvement. Account creation
- [x] don't show Public key in navbar but rather in profile
- [x] After changing our name in the profile page update the DB key and value

# Extra stuffs done
- [x] Usercard feature to delete contacts
- [x] Removed adding and displaying oneself in contact list
- [x] Able to change and update username but not reflected to other users who is a contact and change in username results No Contacts Found (contact loading is based on username)
