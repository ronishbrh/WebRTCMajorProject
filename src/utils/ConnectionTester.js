export default class ConnectionTester {
  constructor(pc, onUpdate) {
    this.pc = pc;
    this.onUpdate = onUpdate;
    this.collectedStats = [];
    this.lastBytesReceived = 0;
    this.lastBytesSent = 0;
    this.lastTimestamp = 0;
    this.running = false;
    this.headers = new Set();

    // ICE Candidate Tracking (NEW)
    this.iceCandidates = {
      host: 0,
      srflx: 0,      // Server Reflexive (Hole Punching)
      relay: 0,      // TURN
      prflx: 0,      // Peer Reflexive
      unknown: 0
    };

    this.activeCandidatePair = null; // Track which type is being used
    this.callStartTime = null;
    this.isP2P = null; // true = P2P, false = TURN

    // Privacy Metrics (NEW)
    this.privacyMetrics = {
      candidatesGenerated: 0,
      p2pCandidates: 0,
      turnCandidates: 0,
      activeCandidateType: null,
      connectionMethod: null // 'direct', 'hole-punch', 'relay'
    };
  }

  /**
   * Start monitoring connection stats
   * Also hooks into ICE candidate events
   */
  start(intervalMs = 1000) {
    this.running = true;
    this.callStartTime = Date.now();

    // Hook into ICE candidate generation (NEW)
    this.hookIceCandidates();

    const loop = async () => {
      if (!this.running) return;

      const stats = await this.pc.getStats();
      let report = {};
      let candidatePairRtt = null;
      let remoteInboundRtt = null;
      let activeCandidateType = null;

      stats.forEach(r => {
        // Inbound RTP stats
        if (r.type === "inbound-rtp" && !r.isRemote) {
          report.packetsReceived = r.packetsReceived;
          report.bytesReceived = r.bytesReceived;
          report.jitter = r.jitter;
          report.packetsLost = r.packetsLost;
          report.inboundFPS = r.framesPerSecond;
          report.inboundResolutionWidth = r.frameWidth;
          report.inboundResolutionHeight = r.frameHeight;
        }

        // Outbound RTP stats
        if (r.type === "outbound-rtp" && !r.isRemote) {
          report.packetsSent = r.packetsSent;
          report.bytesSent = r.bytesSent;
          report.outboundFPS = r.framesPerSecond
          report.outboundResolutionWidth = r.frameWidth;
          report.outboundResolutionHeight = r.frameHeight;
        }

        // Active candidate pair (NEW: Track which type is active)
        if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded") {
          if (r.currentRoundTripTime !== undefined) {
            candidatePairRtt = r.currentRoundTripTime * 1000;
          }
          report.availableOutgoingBitrate = r.availableOutgoingBitrate;
          report.availableIncomingBitrate = r.availableIncomingBitrate;

          // NEW: Track active candidate type
          const localCandidate = r.localCandidate;
          if (localCandidate) {
            activeCandidateType = localCandidate.type; // 'host', 'srflx', 'relay', 'prflx'
            this.activeCandidatePair = {
              type: activeCandidateType,
              localAddress: localCandidate.address,
              localPort: localCandidate.port,
              remoteAddress: r.remoteCandidate?.address,
              remotePort: r.remoteCandidate?.port,
              protocol: localCandidate.protocol,
              priority: localCandidate.priority
            };

            // Determine connection method
            if (activeCandidateType === 'host') {
              this.isP2P = true;
              this.privacyMetrics.connectionMethod = 'direct';
              report.connectionType = 'Direct (Local Network)';
            } else if (activeCandidateType === 'srflx') {
              this.isP2P = true;
              this.privacyMetrics.connectionMethod = 'hole-punch';
              report.connectionType = 'P2P Hole Punching';
            } else if (activeCandidateType === 'relay') {
              this.isP2P = false;
              this.privacyMetrics.connectionMethod = 'relay';
              report.connectionType = 'TURN Relay';
            } else {
              this.isP2P = null;
              report.connectionType = 'Unknown';
            }
          }
        }

        // Remote inbound RTP (for RTT measurement)
        if (r.type === "remote-inbound-rtp") {
          if (r.roundTripTime !== undefined) {
            remoteInboundRtt = r.roundTripTime * 1000;
          }
        }
      });

      // Finalize report
      report.rtt = candidatePairRtt !== null ? candidatePairRtt : remoteInboundRtt;

      // NEW: Add ICE candidate info to report
      if (activeCandidateType) {
        report.iceCandidateType = activeCandidateType;
        report.isP2P = this.isP2P;
        report.p2pStatus = this.isP2P ? '✅ P2P' : '❌ TURN Relay';
      }

      // Calculate bitrate
      const now = Date.now();
      report.timestamp = now;

      if (this.lastTimestamp > 0) {
        const timeDiff = (now - this.lastTimestamp) / 1000;
        report.downloadBitrate =
          (report.bytesReceived - this.lastBytesReceived) * 8 / timeDiff;
        report.uploadBitrate =
          (report.bytesSent - this.lastBytesSent) * 8 / timeDiff;
      }

      this.lastBytesReceived = report.bytesReceived || 0;
      this.lastBytesSent = report.bytesSent || 0;
      this.lastTimestamp = now;

      // Store stats
      this.collectedStats.push(report);
      Object.keys(report).forEach(k => this.headers.add(k));

      // Callback
      if (this.onUpdate) this.onUpdate(report);

      setTimeout(loop, intervalMs);
    };

    loop();
  }

  /**
   * Hook into ICE candidate events (NEW)
   * Track all candidates generated during the connection
   */
  hookIceCandidates() {
    // Store original handler
    const originalOnicecandidate = this.pc.onicecandidate;

    // Override with our tracking
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const type = event.candidate.type;
        this.iceCandidates[type]++;
        this.privacyMetrics.candidatesGenerated++;

        // Count P2P vs TURN
        if (type === 'host' || type === 'srflx') {
          this.privacyMetrics.p2pCandidates++;
        } else if (type === 'relay') {
          this.privacyMetrics.turnCandidates++;
        }

        console.log(`🎯 ICE Candidate: ${type}`, {
          address: event.candidate.address,
          port: event.candidate.port,
          protocol: event.candidate.protocol,
          priority: event.candidate.priority,
          total_candidates: this.privacyMetrics.candidatesGenerated
        });
      }

      // Call original if it existed
      if (originalOnicecandidate) {
        originalOnicecandidate.call(this.pc, event);
      }
    };
  }

  /**
   * Get P2P success rate (NEW)
   * Calculate percentage of P2P vs TURN usage
   */
  getP2PSuccessRate() {
    const total = this.privacyMetrics.candidatesGenerated;
    if (total === 0) return null;

    const p2pPercentage = (this.privacyMetrics.p2pCandidates / total) * 100;
    const turnPercentage = (this.privacyMetrics.turnCandidates / total) * 100;

    return {
      p2pPercentage: p2pPercentage.toFixed(2),
      turnPercentage: turnPercentage.toFixed(2),
      p2pCandidates: this.privacyMetrics.p2pCandidates,
      turnCandidates: this.privacyMetrics.turnCandidates,
      totalCandidates: total
    };
  }

  /**
   * Get privacy metrics (NEW)
   */
  getPrivacyMetrics() {
    const callDuration = this.callStartTime
      ? ((Date.now() - this.callStartTime) / 1000).toFixed(1)
      : 'N/A';

    return {
      connectionMethod: this.privacyMetrics.connectionMethod,
      currentP2PStatus: this.isP2P ? '✅ P2P' : this.isP2P === false ? '❌ TURN' : '⏳ Connecting',
      activeCandidatePair: this.activeCandidatePair,
      callDuration: callDuration + 's',
      p2pSuccessRate: this.getP2PSuccessRate(),
      candidateBreakdown: this.iceCandidates
    };
  }

  /**
   * Log privacy report to console (NEW)
   */
  logPrivacyReport() {
    const metrics = this.getPrivacyMetrics();
    const p2pStats = metrics.p2pSuccessRate;

    console.log(`
╔════════════════════════════════════════════════════════════╗
║           🔐 PRIVACY & P2P METRICS REPORT                  ║
╚════════════════════════════════════════════════════════════╝

 CONNECTION METHOD: ${metrics.connectionMethod || 'N/A'}
 CALL DURATION: ${metrics.callDuration}

 P2P SUCCESS RATE:
  ├─ P2P Connections: ${p2pStats.p2pPercentage}% (${p2pStats.p2pCandidates} candidates)
  ├─ TURN Relay: ${p2pStats.turnPercentage}% (${p2pStats.turnCandidates} candidates)
  └─ Total Candidates: ${p2pStats.totalCandidates}

 ICE CANDIDATE BREAKDOWN:
  ├─ Host (Direct LAN): ${this.iceCandidates.host}
  ├─ SRFLX (Hole Punching): ${this.iceCandidates.srflx}
  ├─ Relay (TURN): ${this.iceCandidates.relay}
  ├─ Peer Reflexive: ${this.iceCandidates.prflx}
  └─ Unknown: ${this.iceCandidates.unknown}

 ACTIVE CANDIDATE PAIR:
  ├─ Type: ${this.activeCandidatePair?.type || 'N/A'}
  ├─ Local: ${this.activeCandidatePair?.localAddress}:${this.activeCandidatePair?.localPort}
  ├─ Remote: ${this.activeCandidatePair?.remoteAddress}:${this.activeCandidatePair?.remotePort}
  ├─ Protocol: ${this.activeCandidatePair?.protocol || 'N/A'}
  └─ Priority: ${this.activeCandidatePair?.priority || 'N/A'}

 PRIVACY STATUS:
  ${p2pStats.p2pPercentage >= 70 ? '✅ EXCELLENT' : p2pStats.p2pPercentage >= 50 ? '⚠️ GOOD' : '❌ POOR'}: ${p2pStats.p2pPercentage}% P2P connections
  ${this.isP2P === true ? '✅ Currently using P2P connection' : this.isP2P === false ? '⚠️ Currently relying on TURN' : '⏳ Connection establishing...'}

╔════════════════════════════════════════════════════════════╗
    `);
  }

  /**
   * Stop monitoring and download CSV (enhanced) (MODIFIED)
   */
  stop() {
    this.running = false;

    // Log privacy report before downloading
    this.logPrivacyReport();

    this.downloadCSV();
  }

  /**
   * Download stats as CSV (enhanced) (MODIFIED)
   */
  downloadCSV() {
    if (!this.collectedStats.length) {
      console.log('No stats collected yet');
      return;
    }

    // Add privacy metrics as metadata at the top
    const privacyMetrics = this.getPrivacyMetrics();
    const metadataLines = [
      '# PRIVACY & P2P METRICS REPORT',
      `# Connection Method,${privacyMetrics.connectionMethod || 'N/A'}`,
      `# Call Duration,${privacyMetrics.callDuration}`,
      `# P2P Success Rate,${privacyMetrics.p2pSuccessRate.p2pPercentage}%`,
      `# TURN Usage Rate,${privacyMetrics.p2pSuccessRate.turnPercentage}%`,
      `# Total Candidates Generated,${privacyMetrics.p2pSuccessRate.totalCandidates}`,
      `# Host Candidates,${this.iceCandidates.host}`,
      `# SRFLX Candidates (Hole Punching),${this.iceCandidates.srflx}`,
      `# Relay Candidates (TURN),${this.iceCandidates.relay}`,
      `# Peer Reflexive Candidates,${this.iceCandidates.prflx}`,
      '#',
      '# DETAILED STATS BELOW:',
      ''
    ];

    // CSV data
    const headers = [...this.headers];
    const rows = [
      headers.join(","),
      ...this.collectedStats.map(stat =>
        headers.map(h => stat[h] ?? 0).join(",")
      )
    ];

    // Combine metadata + data
    const csvContent = metadataLines.join("\n") + rows.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `connection_metrics_${new Date().getTime()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ Metrics downloaded as CSV');
  }

  /**
   * Manual trigger for CSV download (NEW)
   * Can be called from a button click
   */
  exportMetricsCSV() {
    this.downloadCSV();
  }

  /**
   * Get a summary for testing (NEW)
   */
  getSummary() {
    const p2pStats = this.getP2PSuccessRate();
    const avgDownload = (
      this.collectedStats.reduce((sum, s) => sum + (s.downloadBitrate || 0), 0) /
      (this.collectedStats.length || 1)
    ).toFixed(0);
    const avgUpload = (
      this.collectedStats.reduce((sum, s) => sum + (s.uploadBitrate || 0), 0) /
      (this.collectedStats.length || 1)
    ).toFixed(0);

    return {
      totalCalls: this.collectedStats.length,
      p2pSuccessRate: p2pStats?.p2pPercentage + '%' || 'N/A',
      turnUsageRate: p2pStats?.turnPercentage + '%' || 'N/A',
      averageDownloadBitrate: avgDownload + ' bps',
      averageUploadBitrate: avgUpload + ' bps',
      connectionMethod: this.privacyMetrics.connectionMethod,
      candidateBreakdown: this.iceCandidates
    };
  }
}
