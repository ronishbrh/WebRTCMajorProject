
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
	}

	start(intervalMs = 1000) {
		this.running = true;

		const loop = async () => {
			if (!this.running) return;

			const stats = await this.pc.getStats();
			let report = {};

			let candidatePairRtt = null;
			let remoteInboundRtt = null;

			stats.forEach(r => {
				if (r.type === "inbound-rtp" && !r.isRemote) {
					report.packetsReceived = r.packetsReceived;
					report.bytesReceived = r.bytesReceived;
					report.jitter = r.jitter;
					report.packetsLost = r.packetsLost;
				}
				if (r.type === "outbound-rtp" && !r.isRemote) {
					report.packetsSent = r.packetsSent;
					report.bytesSent = r.bytesSent;
				}
				if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded") {
					if (r.currentRoundTripTime !== undefined) {
						candidatePairRtt = r.currentRoundTripTime * 1000;
					}
					report.availableOutgoingBitrate = r.availableOutgoingBitrate;
					report.availableIncomingBitrate = r.availableIncomingBitrate;
				}

				if (r.type === "remote-inbound-rtp") {
					if (r.roundTripTime !== undefined) {
						remoteInboundRtt = r.roundTripTime * 1000;
					}
				}
			});

			report.rtt = candidatePairRtt !== null ? candidatePairRtt : remoteInboundRtt;

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

			this.collectedStats.push(report);

			Object.keys(report).forEach(k => this.headers.add(k));

			if (this.onUpdate) this.onUpdate(report);

			setTimeout(loop, intervalMs);
		};

		loop();
	}

	stop() {
		this.running = false;
		if(false){
			this.downloadCSV();
		}
	}

	downloadCSV() {
		if (!this.collectedStats.length) return;

		const headers = [...this.headers];

		const rows = [
			[...headers].join(","),
			...this.collectedStats.map(stat =>
				headers.map(h => stat[h] ?? 0).join(",")
			)
		];

		const blob = new Blob([rows.join("\n")], { type: "text/csv" });

		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);

		link.href = url;
		link.download = "connection_metrics.csv";

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		URL.revokeObjectURL(url);
	}
}
