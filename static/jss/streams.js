const APP_ID = 'aa594f47cfc84b1abf37055ffd3e1f29';

const CHANNEL = sessionStorage.getItem('room');
const TOKEN = sessionStorage.getItem('token');
let UID = Number(sessionStorage.getItem('UID'));

let localTracks = [];
let remoteUsers = {};

let MAIN_ROOM = CHANNEL;
let currentRoom = CHANNEL;

const client = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8'
});

// ---------------- EVENTS ----------------
client.on('user-published', handleUserJoined);
client.on('user-left', handleUserLeft);

// ---------------- CORE ROOM SWITCH ----------------
async function joinRoom(roomName) {
    console.log("Switching to room:", roomName);

    currentRoom = roomName;
    sessionStorage.setItem("currentRoom", roomName);

    // leave safely
    try {
        await client.leave();
    } catch (e) {
        console.log("Leave ignored:", e);
    }

    // stop & close tracks
    if (localTracks.length > 0) {
        localTracks.forEach(track => {
            track.stop();
            track.close();
        });
    }
    localTracks = [];

    // clear UI
    const videoBox = document.getElementById("video-streams");
    if (videoBox) videoBox.innerHTML = "";

    // get token
    let res = await fetch(`/get_token/?channel=${roomName}`);
    let data = await res.json();

    // join Agora
    await client.join(APP_ID, roomName, data.token, data.uid);

    // create tracks
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    // render local user
    if (videoBox) {
        videoBox.innerHTML = `
            <div class="video-container">
                <div><span class="username-wrapper">Me</span></div>
                <div class="video-player" id="user-${data.uid}"></div>
            </div>
        `;
    }

    localTracks[1].play(`user-${data.uid}`);

    await client.publish(localTracks);
}

// ---------------- START MAIN ROOM ----------------
async function joinAndDisplayLocalStream() {
    const roomLabel = document.getElementById('room-name');
    if (roomLabel) roomLabel.innerText = CHANNEL;

    await joinRoom(CHANNEL);
}

// ---------------- REMOTE USERS ----------------
async function handleUserJoined(user, mediaType) {
    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    if (mediaType === 'video') {

        let existing = document.getElementById(`user-container-${user.uid}`);
        if (existing) existing.remove();

        const videoBox = document.getElementById("video-streams");

        if (videoBox) {
            videoBox.insertAdjacentHTML("beforeend", `
                <div class="video-container" id="user-container-${user.uid}">
                    <div>
                        <span class="username-wrapper">User ${user.uid}</span>
                    </div>
                    <div class="video-player" id="user-${user.uid}"></div>
                </div>
            `);
        }

        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}

function handleUserLeft(user) {
    delete remoteUsers[user.uid];

    let el = document.getElementById(`user-container-${user.uid}`);
    if (el) el.remove();
}

// ---------------- CONTROLS ----------------
let leaveAndRemoveLocalStream = async () => {

    if (localTracks.length > 0) {
        localTracks.forEach(track => {
            track.stop();
            track.close();
        });
    }

    await client.leave();
    window.open('/', '_self');
};

let toggleCamera = async () => {
    localTracks[1].setMuted(!localTracks[1].muted);
};

let toggleMic = async () => {
    localTracks[0].setMuted(!localTracks[0].muted);
};

// ---------------- BREAKOUT SYSTEM ----------------
let breakoutRooms = [];

// create breakout rooms
const breakoutBtn = document.getElementById("create-breakout-btn");

if (breakoutBtn) {
    breakoutBtn.onclick = async () => {

        const room = sessionStorage.getItem("room");

        let res = await fetch(`/create-breakouts/?room=${room}`);
        let data = await res.json();

        breakoutRooms = data.rooms;

        let box = document.getElementById("breakout-list");
        if (!box) return;

        box.innerHTML = "";

        breakoutRooms.forEach(r => {
            box.innerHTML += `
                <div class="mb-2">
                    <b>${r}</b>
                    <button class="btn btn-sm btn-primary"
                        onclick="joinBreakout('${r}')">
                        Join
                    </button>
                </div>
            `;
        });
    };
}

// join breakout
async function joinBreakout(roomName) {
    await joinRoom(roomName);
}

// return main room
function returnToMainRoom() {
    joinRoom(MAIN_ROOM);
}

// ---------------- START APP ----------------
joinAndDisplayLocalStream();

document.getElementById('leave-btn')?.addEventListener('click', leaveAndRemoveLocalStream);
document.getElementById('mic-btn')?.addEventListener('click', toggleMic);
document.getElementById('cam-btn')?.addEventListener('click', toggleCamera);