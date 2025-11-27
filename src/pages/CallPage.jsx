import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Resolution presets
const RESOLUTIONS = {
    low: { width: 640, height: 480, label: "SD (480p)" },
    medium: { width: 1280, height: 720, label: "HD (720p)" },
    high: { width: 1920, height: 1080, label: "Full HD (1080p)" }
};

export default function CallPage() {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const [localStream, setLocalStream] = useState(null);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [error, setError] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [resolution, setResolution] = useState("medium");

    const navigate = useNavigate();
    // Get local video stream
    const getLocalStream = async (resolutionKey) => {
        try {
            const res = RESOLUTIONS[resolutionKey];
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: res.width },
                    height: { ideal: res.height }
                },
                audio: true
            });

            // Stop old stream if exists
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            setLocalStream(stream);

            // Attach stream to video element
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            setError(null);
        } catch (err) {
            console.error("Error accessing media devices:", err);
            setError("Unable to access camera/microphone. Please grant permissions and refresh.");
        }
    };

    // Initial stream on mount
    useEffect(() => {
        let isMounted = true;

        const start = async () => {
            const stream = await getLocalStream("medium");
            if (isMounted) setLocalStream(stream);
        };

        start();

        return () => {
            isMounted = false;
        };
    }, []);

    // Handle resolution change
    const handleResolutionChange = async (newResolution) => {
        setResolution(newResolution);
        await getLocalStream(newResolution);
        setShowSettings(false);
    };

    // Toggle video
    const toggleVideo = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOn(videoTrack.enabled);
            }
        }
    };

    // Toggle audio
    const toggleAudio = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioOn(audioTrack.enabled);
            }
        }
    };

    // End call
    const handleEndCall = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        navigate("/")
    };

    return (
        <div className="w-full min-h-screen flex flex-col bg-black">
            <div className="flex-1 relative text-white flex items-stretch">
                {/* Remote video area */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full h-full flex items-center justify-center bg-gray-800 relative">
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <p className="absolute text-lg opacity-60 text-center px-4">
                            Waiting for remote user...
                        </p>
                    </div>
                </div>

                {/* Floating local preview - YOUR VIDEO */}
                <div className="absolute top-4 right-4 w-40 h-32 sm:w-48 sm:h-36 bg-gray-900 rounded-lg shadow-2xl overflow-hidden border-2 border-gray-700">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                    />
                    {!isVideoOn && (
                        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                            <span className="text-4xl">👤</span>
                        </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black bg-opacity-60 px-2 py-0.5 rounded text-xs">
                        You • {RESOLUTIONS[resolution].label}
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-md text-sm">
                        {error}
                    </div>
                )}

                {/* Settings Panel */}
                {showSettings && (
                    <div className="absolute top-20 right-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-64">
                        <h3 className="text-sm font-semibold mb-3 text-white">Video Quality</h3>
                        <div className="space-y-2">
                            {Object.entries(RESOLUTIONS).map(([key, value]) => (
                                <button
                                    key={key}
                                    onClick={() => handleResolutionChange(key)}
                                    className={`w-full text-left px-3 py-2 rounded transition ${resolution === key
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="font-medium text-sm">{value.label}</div>
                                    <div className="text-xs opacity-70">{value.width}x{value.height}</div>
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-700">
                            <p className="text-xs text-gray-400">
                                Higher quality uses more bandwidth
                            </p>
                        </div>
                    </div>
                )}

                {/* Bottom control bar */}
                <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 px-4">
                    <button
                        onClick={handleEndCall}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full text-white text-sm font-medium shadow-lg cursor-pointer transition"
                        aria-label="end-call"
                    >
                        End Call
                    </button>

                    <div className="flex items-center gap-3 bg-gray-800 bg-opacity-80 backdrop-blur rounded-full p-2 shadow-lg">
                        <button
                            onClick={toggleAudio}
                            className={`p-3 rounded-full ${isAudioOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
                                } cursor-pointer transition`}
                            aria-label={isAudioOn ? "Mute" : "Unmute"}
                            title={isAudioOn ? "Mute" : "Unmute"}
                        >
                            <span className="text-xl">{isAudioOn ? '🎙️' : '🔇'}</span>
                        </button>

                        <button
                            onClick={toggleVideo}
                            className={`p-3 rounded-full ${isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
                                } cursor-pointer transition`}
                            aria-label={isVideoOn ? "Turn off camera" : "Turn on camera"}
                            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
                        >
                            <span className="text-xl">{isVideoOn ? '🎥' : '📷'}</span>
                        </button>

                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-3 rounded-full ${showSettings ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                                } cursor-pointer transition`}
                            aria-label="Settings"
                            title="Settings"
                        >
                            <span className="text-xl">⚙️</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}