const APP_ID = 'aa594f47cfc84b1abf37055ffd3e1f29';

const CHANNEL = sessionStorage.getItem('room');
let UID = Number(sessionStorage.getItem('UID'));
let NAME = sessionStorage.getItem('name');

let localTracks = [];
let remoteUsers = {};

let MAIN_ROOM = CHANNEL;
let currentRoom = CHANNEL;

let joiningRoom = false;

// Screen share state
let screenTrack = null;
let screenClient = null;
let isScreenSharing = false;

// Tracks UIDs currently being rendered to prevent race condition duplicates
const renderingUsers = new Set();

// ---------------- ROOM DISPLAY ----------------
function updateRoomUI() {
    const label = document.getElementById("room-name");
    if (!label) return;
    label.innerText = currentRoom === MAIN_ROOM
        ? `Main Room: ${currentRoom}`
        : `Breakout Room: ${currentRoom}`;
}

// ---------------- ROOM MEMBERS ----------------
async function createMember() {
    try {
        const res = await fetch('/create_member/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: NAME, UID: String(UID), room_name: currentRoom })
        });
        if (!res.ok) console.error('createMember failed:', res.status);
    } catch (e) {
        console.error('createMember error:', e);
    }
}

async function getMember(uid) {
    try {
        const res = await fetch(`/get_member/?UID=${uid}&room_name=${currentRoom}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error('getMember error:', e);
        return { name: `User ${uid}` };
    }
}

async function deleteMember(room = currentRoom, uid = UID) {
    try {
        const res = await fetch('/delete_member/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: NAME, UID: String(uid), room_name: room })
        });
        if (!res.ok) console.error('deleteMember failed:', res.status);
    } catch (e) {
        console.error('deleteMember error:', e);
    }
}

// ---------------- PARTICIPANTS ----------------
async function loadParticipants() {
    const box = document.getElementById("participant-list");
    if (!box) return;
    try {
        const res = await fetch(`/get_room_members/?room_name=${currentRoom}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        box.innerHTML = "";
        data.members.forEach(m => {
            box.innerHTML += `<div>${m.name}</div>`;
        });
    } catch (e) {
        console.error('loadParticipants error:', e);
    }
}

// ---------------- AGORA ----------------
const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

client.on('user-published', handleUserJoined);
client.on('user-left', handleUserLeft);

// ---------------- RENDER TILE (deduplicated) ----------------
async function renderUserTile(uid, videoTrack, box) {
    if (document.getElementById(`user-container-${uid}`)) return;
    if (renderingUsers.has(uid)) return;

    renderingUsers.add(uid);

    try {
        const member = await getMember(uid);

        if (document.getElementById(`user-container-${uid}`)) return;

        box.insertAdjacentHTML("beforeend", `
            <div class="video-container" id="user-container-${uid}">
                <div><span class="username-wrapper">${member.name || `User ${uid}`}</span></div>
                <div class="video-player" id="user-${uid}"></div>
            </div>
        `);

        videoTrack.play(`user-${uid}`);
    } finally {
        renderingUsers.delete(uid);
    }
}

// ---------------- JOIN ROOM CORE ----------------
async function joinRoom(roomName) {
    if (joiningRoom) return;
    joiningRoom = true;

    const oldRoom = currentRoom;
    currentRoom = roomName;
    sessionStorage.setItem("currentRoom", roomName);
    updateRoomUI();

    try {
        if (oldRoom) await deleteMember(oldRoom, UID);

        if (localTracks.length > 0) {
            localTracks.forEach(t => { try { t.stop(); t.close(); } catch (e) {} });
            localTracks = [];
        }

        try { await client.leave(); } catch (e) {}

        const videoBox = document.getElementById("video-streams");
        if (videoBox) videoBox.innerHTML = "";
        renderingUsers.clear();

        const res = await fetch(`/get_token/?channel=${roomName}`);
        if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
        const data = await res.json();

        await client.join(APP_ID, roomName, data.token, data.uid);

        UID = data.uid;
        sessionStorage.setItem('UID', String(UID));

        await createMember();
        await loadParticipants();

        for (const user of client.remoteUsers) {
            if (user.uid === UID) continue;

            remoteUsers[user.uid] = user;

            if (user.hasVideo) await client.subscribe(user, 'video');
            if (user.hasAudio) await client.subscribe(user, 'audio');

            if (user.videoTrack && videoBox) {
                await renderUserTile(user.uid, user.videoTrack, videoBox);
            }

            if (user.audioTrack) user.audioTrack.play();
        }

        localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

        if (videoBox) {
            videoBox.insertAdjacentHTML("beforeend", `
                <div class="video-container" id="user-container-${UID}">
                    <div><span class="username-wrapper">${NAME || "Anonymous"}</span></div>
                    <div class="video-player" id="user-${UID}"></div>
                </div>
            `);
        }

        localTracks[1].play(`user-${UID}`);
        await client.publish(localTracks);

    } catch (e) {
        console.error('joinRoom error:', e);
    } finally {
        joiningRoom = false;
    }
}

// ---------------- START ----------------
async function joinAndDisplayLocalStream() {
    await joinRoom(CHANNEL);
}

// ---------------- REMOTE USERS ----------------
async function handleUserJoined(user, mediaType) {
    if (user.uid === UID) return;

    remoteUsers[user.uid] = user;
    await client.subscribe(user, mediaType);

    if (mediaType === "video") {
        const box = document.getElementById("video-streams");
        if (!box) return;
        await renderUserTile(user.uid, user.videoTrack, box);
    }

    if (mediaType === "audio") {
        user.audioTrack.play();
    }

    loadParticipants();
}

// ---------------- USER LEFT ----------------
function handleUserLeft(user) {
    delete remoteUsers[user.uid];
    const el = document.getElementById(`user-container-${user.uid}`);
    if (el) el.remove();
    loadParticipants();
}

// ---------------- CONTROLS ----------------
async function leaveAndRemoveLocalStream() {
    if (isScreenSharing) await stopScreenShare();

    if (localTracks.length > 0) {
        localTracks.forEach(t => { try { t.stop(); t.close(); } catch (e) {} });
        localTracks = [];
    }

    remoteUsers = {};
    await deleteMember(currentRoom, UID);
    try { await client.leave(); } catch (e) {}

    window.open('/', '_self');
}

function toggleCamera() {
    if (!localTracks[1]) return;
    localTracks[1].setMuted(!localTracks[1].muted);
}

function toggleMic() {
    if (!localTracks[0]) return;
    localTracks[0].setMuted(!localTracks[0].muted);
}

// ---------------- SCREEN SHARE ----------------
async function startScreenShare() {
    try {
        screenClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

        const res = await fetch(`/get_token/?channel=${currentRoom}`);
        if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
        const data = await res.json();

        await screenClient.join(APP_ID, currentRoom, data.token, data.uid);

        screenTrack = await AgoraRTC.createScreenVideoTrack({
            encoderConfig: "1080p_1",
            optimizationMode: "detail"
        }, "auto");

        const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
        const audioTrack = Array.isArray(screenTrack) ? screenTrack[1] : null;

        const tracksToPublish = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
        await screenClient.publish(tracksToPublish);

        isScreenSharing = true;

        const videoBox = document.getElementById("video-streams");
        if (videoBox) {
            videoBox.insertAdjacentHTML("beforeend", `
                <div class="video-container" id="user-container-screen">
                    <div><span class="username-wrapper">${NAME} (Screen)</span></div>
                    <div class="video-player" id="user-screen"></div>
                </div>
            `);
            videoTrack.play("user-screen");
        }

        const btn = document.getElementById('share-screen-btn');
        if (btn) btn.innerText = "Stop Share";

        videoTrack.on("track-ended", stopScreenShare);

    } catch (e) {
        console.error('startScreenShare error:', e);
        if (screenClient) {
            try { await screenClient.leave(); } catch (_) {}
            screenClient = null;
        }
        screenTrack = null;
        isScreenSharing = false;
    }
}

async function stopScreenShare() {
    if (!isScreenSharing) return;

    const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
    const audioTrack = Array.isArray(screenTrack) ? screenTrack[1] : null;

    try {
        if (videoTrack) { videoTrack.stop(); videoTrack.close(); }
        if (audioTrack) { audioTrack.stop(); audioTrack.close(); }
    } catch (e) {}

    try { await screenClient.leave(); } catch (e) {}

    screenTrack = null;
    screenClient = null;
    isScreenSharing = false;

    const el = document.getElementById("user-container-screen");
    if (el) el.remove();

    const btn = document.getElementById('share-screen-btn');
    if (btn) btn.innerText = "Share Screen";
}

async function toggleScreenShare() {
    if (isScreenSharing) {
        await stopScreenShare();
    } else {
        await startScreenShare();
    }
}

// ---------------- BREAKOUT ----------------
document.getElementById("create-breakout-btn")?.addEventListener("click", async () => {
    const res = await fetch(`/create-breakouts/?room=${MAIN_ROOM}`);
    if (!res.ok) { console.error('create-breakouts failed:', res.status); return; }
    const data = await res.json();

    const box = document.getElementById("breakout-list");
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
document.getElementById('share-screen-btn')?.addEventListener('click', toggleScreenShare);
document.getElementById('return-main-btn')?.addEventListener('click', returnToMainRoom);