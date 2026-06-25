const APP_ID = 'aa594f47cfc84b1abf37055ffd3e1f29';

const CHANNEL = sessionStorage.getItem('room');
let UID = Number(sessionStorage.getItem('UID'));

let localTracks = [];
let remoteUsers = {};

let MAIN_ROOM = CHANNEL;
let currentRoom = CHANNEL;

// ---------------- CLIENTS ----------------
const client = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8'
});

const screenClient = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8'
});

let screenTrack = null;
let screenUid = null;
let sharing = false;

// ---------------- EVENTS ----------------
client.on('user-published', handleUserJoined);
client.on('user-left', handleUserLeft);

// ---------------- JOIN ROOM ----------------
async function joinRoom(roomName) {

    console.log("Switching to room:", roomName);

    currentRoom = roomName;
    sessionStorage.setItem("currentRoom", roomName);

    // stop screen share if active
    if (screenTrack) {
        await stopScreenShare();
    }

    // leave main client safely
    try {
        await client.leave();
    } catch (e) {}

    // stop local tracks
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

    // join main client
    await client.join(APP_ID, roomName, data.token, data.uid);

    // create camera + mic
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    // render local
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

// ---------------- START APP ----------------
async function joinAndDisplayLocalStream() {

    const roomLabel = document.getElementById('room-name');
    if (roomLabel) roomLabel.innerText = CHANNEL;

    await joinRoom(CHANNEL);
}

// ---------------- REMOTE USERS ----------------
async function handleUserJoined(user, mediaType) {

    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    // ---------------- SCREEN SHARE ----------------
    if (String(user.uid).includes("-screen")) {

        const screenBox = document.getElementById("screen-container");

        if (mediaType === "video" && screenBox) {
            screenBox.innerHTML = "";
            user.videoTrack.play("screen-container");
        }

        return;
    }

    // ---------------- NORMAL USERS ----------------
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

    if (screenTrack) {
        await stopScreenShare();
    }

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

// ---------------- SCREEN SHARE ----------------
async function startScreenShare() {

    // FIX: Agora requires numeric UID
    screenUid = UID + 100000;

    const res = await fetch(
        `/get_token/?channel=${currentRoom}&uid=${screenUid}`
    );

    const data = await res.json();

    await screenClient.join(
        APP_ID,
        currentRoom,
        data.token,
        screenUid
    );

    screenTrack = await AgoraRTC.createScreenVideoTrack();

    await screenClient.publish(screenTrack);

    screenTrack.on("track-ended", async () => {
        await stopScreenShare();
    });

    console.log("Screen sharing started");
}

async function stopScreenShare() {

    if (!screenTrack) return;

    await screenClient.unpublish(screenTrack);

    screenTrack.close();

    await screenClient.leave();

    screenTrack = null;
    sharing = false;

    const screenBox = document.getElementById("screen-container");
    if (screenBox) screenBox.innerHTML = "";

    const btn = document.getElementById("share-screen-btn");
    if (btn) btn.textContent = "Share Screen";

    console.log("Screen sharing stopped");
}

// ---------------- BUTTON ----------------
const shareBtn = document.getElementById("share-screen-btn");

if (shareBtn) {

    shareBtn.addEventListener("click", async () => {

        if (!sharing) {
            await startScreenShare();
            sharing = true;
            shareBtn.textContent = "Stop Sharing";
        } else {
            await stopScreenShare();
            sharing = false;
            shareBtn.textContent = "Share Screen";
        }
    });
}

// ---------------- BREAKOUT ROOMS ----------------
let breakoutRooms = [];

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
                <div class="mb-2 px-2 py-3">
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

async function joinBreakout(roomName) {
    await joinRoom(roomName);
}

function returnToMainRoom() {
    joinRoom(MAIN_ROOM);
}

// ---------------- START ----------------
joinAndDisplayLocalStream();

document.getElementById('leave-btn')?.addEventListener('click', leaveAndRemoveLocalStream);
document.getElementById('mic-btn')?.addEventListener('click', toggleMic);
document.getElementById('cam-btn')?.addEventListener('click', toggleCamera);