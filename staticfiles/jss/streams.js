const APP_ID = 'aa594f47cfc84b1abf37055ffd3e1f29';
const CHANNEL = sessionStorage.getItem('room');
const TOKEN = sessionStorage.getItem('token');
let UID = Number(sessionStorage.getItem('UID'))

let localTracks = [];
let remoteUsers = {};

const client = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8'
});

client.on('user-published', handleUserJoined);
client.on('user-left', handleUserLeft);

async function joinAndDisplayLocalStream() {
    document.getElementById('room-name').innerText = CHANNEL

   try{
    await client.join(APP_ID, CHANNEL, TOKEN, UID)
   }catch(error){
        console.error(error)
        window.open('', '_self')
   }

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    let player = `
        <div class="video-container" id="user-container-${UID}">
            <div>
                <span class="username-wrapper">Me</span>
            </div>
            <div class="video-player" id="user-${UID}"></div>
        </div>
    `;

    document.getElementById('video-streams')
        .insertAdjacentHTML('beforeend', player);

    localTracks[1].play(`user-${UID}`);

    await client.publish(localTracks);
}

async function handleUserJoined(user, mediaType) {

    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    if (mediaType === 'video') {

        let player = document.getElementById(
            `user-container-${user.uid}`
        );

        if (player) {
            player.remove();
        }

        player = `
            <div class="video-container" id="user-container-${user.uid}">
                <div>
                    <span class="username-wrapper">
                        User ${user.uid}
                    </span>
                </div>
                <div class="video-player" id="user-${user.uid}"></div>
            </div>
        `;

        document.getElementById('video-streams')
            .insertAdjacentHTML('beforeend', player);

        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}

function handleUserLeft(user) {

    delete remoteUsers[user.uid];

    let player = document.getElementById(
        `user-container-${user.uid}`
    );

    if (player) {
        player.remove();
    }
}

let leaveAndRemoveLocalStream = async () => {
    for(let i=0; localTracks.length > i; i++ ){
        localTracks[i].stop() 
        localTracks[i].close()
    }

    await client.leave()
    window.open('/','_self')
}

let toggleCamera = async (e) => {
    if(localTracks[1].muted){
        await localTracks[1].setMuted(false)
    }else{
        await localTracks[1].setMuted(true)
    }
}

let toggleMic = async (e) => {
    if(localTracks[0].muted){
        await localTracks[0].setMuted(false)
    }else{
        await localTracks[0].setMuted(true)
    }
}


joinAndDisplayLocalStream();
document.getElementById('leave-btn').addEventListener('click', leaveAndRemoveLocalStream)
document.getElementById('mic-btn').addEventListener('click', toggleMic)
document.getElementById('cam-btn').addEventListener('click', toggleCamera)
