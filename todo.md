- [ ] List input video sources. mobile ma fron and back camera ko laagi
- [ ] QR
- [ ] Handle renegotiation, retry call
- [ ] Make the client PWA
- [x] The camera indicator is still on after peer disconnects. Properly release resources. Camera is still on the peer who didn't hangup the call first
- [ ] UI improvement kun page ma xau tyo page ko button highlight
- [x] Why use url in avatar in HomePage:58? OR Use the first letter of the userName as capital and show it in avatar
- [ ] use https and wss between server and client

# Before Presentation
- [ ] List supported resolition. afaile arbitrary resolution set garne milne hoki number of supported resolution ho.
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
- [ ] After changing our name in the profile page update the DB key and value
- [ ] Multiple device bich call test garne within a LAN.

# Extra stuffs done
- [x] Usercard feature to delete contacts
- [x] Removed adding and displaying oneself in contact list
- [x] Able to change and update username but not reflected to other users who is a contact and change in username results No Contacts Found (contact loading is based on username)