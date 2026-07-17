const app = document.getElementById('app');
const toast = document.getElementById('toast');
let currentStream = null;
let micEnabled = true;
let cameraEnabled = true;

const $ = (selector, root = document) => root.querySelector(selector);
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
};

function generateRoomId() {
  const random = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `kavymeet-${random}${time}`;
}

function getRoute() {
  const hash = window.location.hash || '#home';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  return { path, params };
}

function render() {
  const { path, params } = getRoute();
  stopStream();
  if (path.startsWith('#room')) return renderRoom(params.get('id') || generateRoomId());
  if (path === '#lobby') return renderLobby(params.get('room') || '');
  return renderHome();
}

function mountTemplate(id) {
  app.innerHTML = '';
  const template = document.getElementById(id);
  app.appendChild(template.content.cloneNode(true));
}

function renderHome() {
  mountTemplate('home-template');
  $('[data-action="open-lobby"]').addEventListener('click', () => window.location.hash = '#lobby');
  $('[data-action="generate-room"]').addEventListener('click', () => {
    const room = generateRoomId();
    localStorage.setItem('kavymeet-last-room', room);
    window.location.hash = `#lobby?room=${room}`;
    showToast('Room generated successfully');
  });
}

function renderLobby(initialRoom) {
  mountTemplate('lobby-template');
  const nameInput = $('#name-input');
  const emailInput = $('#email-input');
  const roomInput = $('#room-input');
  const saved = JSON.parse(localStorage.getItem('kavymeet-user') || '{}');
  nameInput.value = saved.name || '';
  emailInput.value = saved.email || '';
  roomInput.value = initialRoom || localStorage.getItem('kavymeet-last-room') || '';

  $('[data-action="generate-room-inline"]').addEventListener('click', () => {
    roomInput.value = generateRoomId();
    localStorage.setItem('kavymeet-last-room', roomInput.value);
    showToast('New room number generated');
  });
  $('[data-action="start-camera"]').addEventListener('click', () => startCamera('#preview-video', '#preview-placeholder'));
  $('[data-action="stop-camera"]').addEventListener('click', stopStream);
  $('[data-action="copy-lobby-link"]').addEventListener('click', async () => {
    if (!roomInput.value.trim()) roomInput.value = generateRoomId();
    await copyText(`${location.origin}${location.pathname}#lobby?room=${encodeURIComponent(roomInput.value.trim())}`);
  });
  $('#lobby-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    let room = roomInput.value.trim();
    if (!room) room = generateRoomId();
    localStorage.setItem('kavymeet-user', JSON.stringify({ name, email }));
    localStorage.setItem('kavymeet-last-room', room);
    window.location.hash = `#room?id=${encodeURIComponent(room)}`;
  });
}

function renderRoom(roomId) {
  mountTemplate('room-template');
  $('#room-title').textContent = `Room Page`;
  $('#room-id-badge').textContent = roomId;
  startCamera('#room-video', '#room-placeholder');
  loadChat(roomId);
  $('[data-action="copy-room-link"]').forEach?.(btn => btn.addEventListener('click', () => copyRoomLink(roomId)));
  document.querySelectorAll('[data-action="copy-room-link"]').forEach(btn => btn.addEventListener('click', () => copyRoomLink(roomId)));
  $('[data-action="leave-room"]').addEventListener('click', () => window.location.hash = `#lobby?room=${encodeURIComponent(roomId)}`);
  $('[data-action="toggle-mic"]').addEventListener('click', toggleMic);
  $('[data-action="toggle-camera"]').addEventListener('click', toggleCamera);
  $('[data-action="share-screen"]').addEventListener('click', shareScreen);
  $('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    addMessage(roomId, text, true);
    input.value = '';
  });
}

async function startCamera(videoSelector, placeholderSelector) {
  try {
    stopStream();
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = $(videoSelector);
    const placeholder = $(placeholderSelector);
    video.srcObject = currentStream;
    if (placeholder) placeholder.style.display = 'none';
    micEnabled = true;
    cameraEnabled = true;
    showToast('Camera started');
  } catch (error) {
    console.error(error);
    showToast('Allow camera/mic permission to start stream');
  }
}

function stopStream() {
  if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  currentStream = null;
}

function toggleMic() {
  if (!currentStream) return showToast('Start camera first');
  micEnabled = !micEnabled;
  currentStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  showToast(micEnabled ? 'Microphone on' : 'Microphone muted');
}

function toggleCamera() {
  if (!currentStream) return showToast('Start camera first');
  cameraEnabled = !cameraEnabled;
  currentStream.getVideoTracks().forEach(track => track.enabled = cameraEnabled);
  showToast(cameraEnabled ? 'Camera on' : 'Camera off');
}

async function shareScreen() {
  try {
    stopStream();
    currentStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const video = $('#room-video');
    const placeholder = $('#room-placeholder');
    video.srcObject = currentStream;
    if (placeholder) placeholder.style.display = 'none';
    showToast('Screen sharing started');
  } catch (error) {
    console.error(error);
    showToast('Screen share cancelled');
  }
}

async function copyRoomLink(roomId) {
  await copyText(`${location.origin}${location.pathname}#room?id=${encodeURIComponent(roomId)}`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Link copied');
  } catch {
    prompt('Copy this link:', text);
  }
}

function chatKey(roomId) { return `kavymeet-chat-${roomId}`; }

function loadChat(roomId) {
  const messages = JSON.parse(localStorage.getItem(chatKey(roomId)) || '[]');
  const list = $('#chat-list');
  list.innerHTML = '';
  if (messages.length === 0) {
    addMessageToDOM('Welcome to KavyMeet. Share the invite link to bring another participant.', false);
  } else {
    messages.forEach(msg => addMessageToDOM(msg.text, msg.me));
  }
}

function addMessage(roomId, text, me) {
  const messages = JSON.parse(localStorage.getItem(chatKey(roomId)) || '[]');
  messages.push({ text, me, at: Date.now() });
  localStorage.setItem(chatKey(roomId), JSON.stringify(messages));
  addMessageToDOM(text, me);
}

function addMessageToDOM(text, me) {
  const div = document.createElement('div');
  div.className = `message ${me ? 'me' : ''}`;
  div.textContent = text;
  $('#chat-list').appendChild(div);
  $('#chat-list').scrollTop = $('#chat-list').scrollHeight;
}

document.getElementById('year').textContent = new Date().getFullYear();
window.addEventListener('hashchange', render);
render();
