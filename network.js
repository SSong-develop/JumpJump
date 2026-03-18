// network.js - WebRTC P2P DataChannel for 1v1 Battle Mode
// No backend server required - manual signaling via copy/paste

const Network = (() => {
    let peerConnection = null;
    let dataChannel = null;
    let isHost = false;
    let connected = false;
    let onMessageCallback = null;
    let onConnectedCallback = null;
    let onDisconnectedCallback = null;

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    function init() {
        peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            if (state === 'connected' || state === 'completed') {
                connected = true;
                if (onConnectedCallback) onConnectedCallback();
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                connected = false;
                if (onDisconnectedCallback) onDisconnectedCallback();
            }
        };
    }

    function setupDataChannel(channel) {
        dataChannel = channel;
        dataChannel.onopen = () => {
            connected = true;
            if (onConnectedCallback) onConnectedCallback();
        };
        dataChannel.onclose = () => {
            connected = false;
            if (onDisconnectedCallback) onDisconnectedCallback();
        };
        dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (onMessageCallback) onMessageCallback(data);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };
    }

    // Host: Create offer and return SDP string
    async function createRoom() {
        isHost = true;
        init();

        // Create data channel
        const channel = peerConnection.createDataChannel('battle', {
            ordered: false,
            maxRetransmits: 0
        });
        setupDataChannel(channel);

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Wait for ICE gathering to complete
        await new Promise((resolve) => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                peerConnection.onicegatheringstatechange = () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                };
                // Timeout after 5 seconds
                setTimeout(resolve, 5000);
            }
        });

        const sdp = JSON.stringify(peerConnection.localDescription);
        return btoa(sdp);
    }

    // Guest: Accept offer and return answer SDP string
    async function joinRoom(offerCode) {
        isHost = false;
        init();

        // Listen for data channel
        peerConnection.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        // Set remote description from offer
        const offerSDP = JSON.parse(atob(offerCode));
        await peerConnection.setRemoteDescription((offerSDP));

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Wait for ICE gathering
        await new Promise((resolve) => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                peerConnection.onicegatheringstatechange = () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                };
                setTimeout(resolve, 5000);
            }
        });

        const sdp = JSON.stringify(peerConnection.localDescription);
        return btoa(sdp);
    }

    // Host: Accept answer from guest
    async function acceptAnswer(answerCode) {
        const answerSDP = JSON.parse(atob(answerCode));
        await peerConnection.setRemoteDescription((answerSDP));
    }

    // Send data to peer
    function send(data) {
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(data));
        }
    }

    // Send game state at regular intervals
    function sendGameState(state) {
        send({
            type: 'gameState',
            ...state
        });
    }

    function sendMessage(type, payload) {
        send({ type, ...payload });
    }

    function onMessage(callback) {
        onMessageCallback = callback;
    }

    function onConnected(callback) {
        onConnectedCallback = callback;
    }

    function onDisconnected(callback) {
        onDisconnectedCallback = callback;
    }

    function isConnected() {
        return connected;
    }

    function isHostPlayer() {
        return isHost;
    }

    function disconnect() {
        if (dataChannel) {
            dataChannel.close();
            dataChannel = null;
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        connected = false;
        isHost = false;
    }

    return {
        createRoom,
        joinRoom,
        acceptAnswer,
        send,
        sendGameState,
        sendMessage,
        onMessage,
        onConnected,
        onDisconnected,
        isConnected,
        isHostPlayer,
        disconnect
    };
})();
