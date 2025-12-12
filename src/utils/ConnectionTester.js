
export default class ConnectionTester {
    constructor(pc, onUpdate) {
        this.pc = pc;
        this.onUpdate = onUpdate; 
        this.collectedStats = [];

        this.lastBytesReceived = 0;
        this.lastBytesSent = 0;
        this.lastTimestamp = 0;

        this.running = false;
    }

    start(intervalMs = 1000) {
        this.running = true;

        const loop = async () => {
            if (!this.running) return;

            const stats = await this.pc.getStats();
            let report = {};

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
            });

            const now = Date.now();

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

            if (this.onUpdate) this.onUpdate(report);

            setTimeout(loop, intervalMs);
        };

        loop();
    }

    stop() {
        this.running = false;
    }

    downloadCSV() {
        if (!this.collectedStats.length) return;

        const headers = Object.keys(this.collectedStats[0]);
        const rows = [
            headers.join(","),
            ...this.collectedStats.map(stat => headers.map(h => stat[h] ?? 0).join(","))
        ];

        const blob = new Blob([rows.join("\n")], { type: "text/csv" });
        const link = document.createElement("a");

        link.href = URL.createObjectURL(blob);
        link.download = "connection_metrics.csv";
        link.click();
    }
}
