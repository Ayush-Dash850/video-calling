const APP_ID = 'aa594f47cfc84b1abf37055ffd3e1f29';

const CHANNEL = sessionStorage.getItem('room');
let UID = Number(sessionStorage.getItem('UID'));
let NAME = sessionStorage.getItem('name');

let localTracks = [];
let remoteUsers = {};

let MAIN_ROOM = CHANNEL;
let currentRoom = CHANNEL;

// ---------------- ROOM DISPLAY ----------------
function updateRoomUI() {
    const label = document.getElementById("room-name");
    if (!label) return;

    if (currentRoom === MAIN_ROOM) {
        label.innerText = `Main Room: ${currentRoom}`;
    } else {
        label.innerText = `Breakout Room: ${currentRoom}`;
    }
}

// ---------------- ROOM MEMBERS ----------------
async function createMember() {
    try {
        await fetch('/create_member/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: NAME,
                UID: String(UID),
                room_name: currentRoom
            })
        });
    } catch (e) {}
}

async function getMember(uid) {
    try {
        let res = await fetch(`/get_member/?UID=${uid}&room_name=${currentRoom}`);
        return await res.json();
    } catch (e) {
        return { name: `User ${uid}` };
    }
}

async function deleteMember(room = currentRoom, uid = UID) {
    try {
        await fetch('/delete_member/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: NAME,
                UID: String(uid),
                room_name: room
            })
        });
    } catch (e) {}
}

// ---------------- PARTICIPANTS ----------------
async function loadParticipants() {
    const box = document.getElementById("participant-list");
    if (!box) return;

    try {
        let res = await fetch(`/get_room_members/?room_name=${currentRoom}`);
        let data = await res.json();

        box.innerHTML = "";

        data.members.forEach(m => {
            box.innerHTML += `<div>${m.name}</div>`;
        });

    } catch (e) {}
}

// ---------------- AGORA ----------------
const client = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8'
});

client.on('user-published', handleUserJoined);
client.on('user-left', handleUserLeft);

// ---------------- JOIN ROOM CORE ----------------
async function joinRoom(roomName) {

    let oldRoom = currentRoom;
    currentRoom = roomName;

    sessionStorage.setItem("currentRoom", roomName);

    updateRoomUI();

    // remove from old room
    if (oldRoom) {
        await deleteMember(oldRoom, UID).catch(() => {});
    }

    // stop old tracks
    if (localTracks.length > 0) {
        localTracks.forEach(t => {
            try { t.stop(); t.close(); } catch (e) {}
        });
    }
    localTracks = [];

    try { await client.leave(); } catch (e) {}

    const videoBox = document.getElementById("video-streams");
    if (videoBox) videoBox.innerHTML = "";

    // token
    let res = await fetch(`/get_token/?channel=${roomName}`);
    let data = await res.json();

    await client.join(APP_ID, roomName, data.token, data.uid);

    UID = data.uid;

    await createMember();
    await loadParticipants();

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    if (videoBox) {
        videoBox.innerHTML = `
            <div class="video-container">
                <div>
                    <span class="username-wrapper">${NAME || "Anonymous"}</span>
                </div>
                <div class="video-player" id="user-${UID}"></div>
            </div>
        `;
    }

    localTracks[1].play(`user-${UID}`);
    await client.publish(localTracks);
}

// ---------------- START ----------------
async function joinAndDisplayLocalStream() {
    await joinRoom(CHANNEL);
}

// ---------------- REMOTE USERS ----------------
async function handleUserJoined(user, mediaType) {

    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    if (mediaType === "video") {

        let existing = document.getElementById(`user-container-${user.uid}`);
        if (existing) existing.remove();

        let member = await getMember(user.uid);

        const box = document.getElementById("video-streams");

        box.insertAdjacentHTML("beforeend", `
            <div class="video-container" id="user-container-${user.uid}">
                <div>
                    <span class="username-wrapper">
                        ${member.name || `User ${user.uid}`}
                    </span>
                </div>
                <div class="video-player" id="user-${user.uid}"></div>
            </div>
        `);

        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === "audio") {
        user.audioTrack.play();
    }

    loadParticipants();
}

// ---------------- USER LEFT ----------------
function handleUserLeft(user) {
    delete remoteUsers[user.uid];

    let el = document.getElementById(`user-container-${user.uid}`);
    if (el) el.remove();

    loadParticipants();
}

// ---------------- CONTROLS ----------------
async function leaveAndRemoveLocalStream() {

    if (localTracks.length > 0) {
        localTracks.forEach(t => {
            try { t.stop(); t.close(); } catch (e) {}
        });
    }

    await deleteMember(currentRoom, UID).catch(() => {});
    await client.leave();

    window.open('/', '_self');
}

function toggleCamera() {
    localTracks[1].setMuted(!localTracks[1].muted);
}

function toggleMic() {
    localTracks[0].setMuted(!localTracks[0].muted);
}

// ---------------- BREAKOUT ----------------
document.getElementById("create-breakout-btn")?.addEventListener("click", async () => {

    let res = await fetch(`/create-breakouts/?room=${MAIN_ROOM}`);
    let data = await res.json();

    let box = document.getElementById("breakout-list");
    if (!box) return;

    box.innerHTML = "";

    data.rooms.forEach(r => {
        box.innerHTML += `
            <div>
                <b>${r}</b>
                <button onclick="joinBreakout('${r}')">Join</button>
            </div>
        `;
    });
});

async function joinBreakout(roomName) {
    await joinRoom(roomName);
}

function returnToMainRoom() {
    joinRoom(MAIN_ROOM);
}

// ---------------- INIT ----------------
joinAndDisplayLocalStream();

document.getElementById('leave-btn')?.addEventListener('click', leaveAndRemoveLocalStream);
document.getElementById('mic-btn')?.addEventListener('click', toggleMic);
document.getElementById('cam-btn')?.addEventListener('click', toggleCamera);