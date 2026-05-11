export async function getMeterredTurnServers() {
  try {
    console.log('Fetching TURN credentials from backend...');

    // const response = await fetch('/api/turn-credentials');
    const response = await fetch('https://webrtc-signaling-server-up3e.onrender.com/api/turn-credentials');
    // const response = await fetch('http://localhost:8080/api/turn-credentials');

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    if (!response.ok) {
      throw new Error(`Backend returned status ${response.status}`);
    }

  
    const text = await response.text();
    console.log('Raw response:', text);


    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('JSON parse failed. Raw text:', text);
      throw e;
    }


    if (!data.iceServers || data.iceServers.length === 0) {
      console.warn('⚠️ No TURN servers returned from backend');
      return [];
    }

    console.log('✅ Got TURN credentials from backend:', {
      serverCount: data.iceServers.length
    });


    return data.iceServers.map(server => ({
      url: typeof server.urls === 'string' ? server.urls : server.urls[0],
      username: server.username || '',
      password: server.credential || '',
      timestamp: new Date().toISOString(),
      source: 'metered'
    }));

  } catch (error) {
    console.error('❌ Failed to fetch TURN servers from backend:', error);
    return [];
  }
}

export async function getIceServersConfig(additionalTurnServers = []) {

  const meterredServers = await getMeterredTurnServers();


  const allTurnServers = [...meterredServers, ...additionalTurnServers];

  
  const config = {
    iceServers: [
     
      {
        urls: [
          'stun:stun.l.google.com:19302',
          // 'stun:stun1.l.google.com:19302',
          // 'stun:stun2.l.google.com:19302',
          // 'stun:stun3.l.google.com:19302',
          // 'stun:stun4.l.google.com:19302',
        ]
      },
      // TURN servers (Metered free + manually added)
      ...allTurnServers.map(server => ({
        urls: [server.url],
        username: server.username || undefined,
        credential: server.password || undefined
      }))
    ]
  };

  console.log('ICE Servers Config:', {
    stunServers: config.iceServers[0].urls.length,
    turnServers: allTurnServers.length
  });

  return config;
}

/**
 * Log connection diagnostics
 * Call this after connection is established
 * 
 * @param {RTCPeerConnection} peerConnection - The peer connection
 */
export async function logConnectionDiagnostics(peerConnection) {
  try {
    const stats = await peerConnection.getStats();

    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        console.log('✅ Active ICE Connection:', {
          candidateType: report.availableOutgoingBitrate ? 'relay' : 'direct',
          roundTripTime: report.currentRoundTripTime,
          availableBitrate: report.availableOutgoingBitrate,
          packagesSent: report.packetsSent,
          packetsLost: report.packetsLost
        });
      }
    });
  } catch (err) {
    console.error('Failed to log diagnostics:', err);
  }
}