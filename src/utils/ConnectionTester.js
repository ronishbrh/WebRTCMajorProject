// utils/ConnectionTester.js
export default class ConnectionTester {
    constructor(pc) {
        this.pc = pc;
        this.collectedStats = [];
    }

    /**
     * Start collecting WebRTC stats
     * @param {number} durationMs
     * @param {number} intervalMs
     * @returns {Promise<Array>}
     */
    async startTest(durationMs = 5000, intervalMs = 1000) {
        const startTime = Date.now();

        while (Date.now() - startTime < durationMs) {
            const statsReport = await this.pc.getStats();
            const summary = {};

            statsReport.forEach(report => {
                if (report.type === "inbound-rtp") {
                    summary.packetsReceived = report.packetsReceived;
                    summary.bytesReceived = report.bytesReceived;
                    summary.jitter = report.jitter;
                    summary.packetsLost = report.packetsLost;
                }
                if (report.type === "outbound-rtp") {
                    summary.packetsSent = report.packetsSent;
                    summary.bytesSent = report.bytesSent;
                }
            });

            this.collectedStats.push({ ...summary });
            await new Promise(res => setTimeout(res, intervalMs));
        }

        return this.collectedStats;
    }

    /**
     * Download collected stats as CSV
     */
    downloadCSV() {
        if (!this.collectedStats.length) return;

        const headers = Object.keys(this.collectedStats[0]);
        const csvRows = [
            headers.join(","),  // header
            ...this.collectedStats.map(stat => headers.map(h => stat[h] ?? 0).join(","))
        ];

        const csvContent = csvRows.join("\n");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `connection_metrics_${timestamp}.csv`;

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
