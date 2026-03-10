import { useState, useRef, useCallback, useEffect } from 'react';

const MODELS = [
    {
        id: 'Xenova/whisper-base',
        label: '⚡ Fast',
        name: 'Whisper Base',
        size: '~75 MB',
        speed: '~2x faster',
        multilingual: true,
        description: 'Great speed & quality balance. Supports 99+ languages.',
    },
    {
        id: 'Xenova/whisper-small',
        label: '🎯 Accurate',
        name: 'Whisper Small',
        size: '~150 MB',
        speed: 'Baseline',
        multilingual: true,
        description: 'Best multilingual accuracy. Supports 99+ languages.',
    },
    {
        id: 'distil-whisper/distil-large-v3.5-ONNX',
        label: '🚀 Turbo',
        name: 'Distil Whisper v3.5',
        size: '~400 MB',
        speed: '~3-4x faster',
        multilingual: false,
        description: 'Blazing fast distilled model. English only. Near-perfect accuracy.',
    },
];

const LANGUAGES = [
    { code: 'auto', name: 'Auto-detect' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'nl', name: 'Dutch' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
    { code: 'tr', name: 'Turkish' },
    { code: 'pl', name: 'Polish' },
    { code: 'sv', name: 'Swedish' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'el', name: 'Greek' },
    { code: 'cs', name: 'Czech' },
    { code: 'ro', name: 'Romanian' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ms', name: 'Malay' },
    { code: 'he', name: 'Hebrew' },
    { code: 'fa', name: 'Persian' },
];

export default function WhisperTranscriber() {
    const [status, setStatus] = useState('idle'); // idle | loading | ready | processing | done | error
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('transcribe'); // transcribe | translate
    const [language, setLanguage] = useState('auto');
    const [audioFile, setAudioFile] = useState(null);
    const [audioUrl, setAudioUrl] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [copied, setCopied] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
    const [loadedModelId, setLoadedModelId] = useState(null);

    const workerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const fileInputRef = useRef(null);

    // Initialize worker
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/whisper.worker.js', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e) => {
            const { type, data } = e.data;

            switch (type) {
                case 'status':
                    setProgressText(data.message || '');
                    break;
                case 'progress':
                    setProgress(data.progress || 0);
                    setProgressText(data.message || '');
                    break;
                case 'model-loaded':
                    setStatus('ready');
                    setModelLoaded(true);
                    setProgressText('');
                    break;
                case 'result':
                    setResult(data.text || '');
                    setStatus('done');
                    setProgressText('');
                    break;
                case 'error':
                    setError(data.message || 'An unknown error occurred');
                    setStatus('error');
                    setProgressText('');
                    break;
            }
        };

        workerRef.current = worker;

        return () => worker.terminate();
    }, []);

    // Load model
    const loadModel = useCallback(() => {
        if (!workerRef.current) return;
        setStatus('loading');
        setProgress(0);
        setError('');
        setModelLoaded(false);
        setLoadedModelId(null);
        workerRef.current.postMessage({ type: 'load-model', data: { modelId: selectedModel } });
    }, [selectedModel]);

    // When model loads, record which one
    const origOnModelLoaded = useRef(null);
    useEffect(() => {
        if (modelLoaded && !loadedModelId) {
            setLoadedModelId(selectedModel);
        }
    }, [modelLoaded, loadedModelId, selectedModel]);

    // Lock language to English for distil model
    const currentModelConfig = MODELS.find(m => m.id === (loadedModelId || selectedModel));
    const isEnglishOnly = currentModelConfig && !currentModelConfig.multilingual;

    // Handle file input
    const handleFile = useCallback((file) => {
        if (!file) return;
        setAudioFile(file);
        setResult('');
        setError('');

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
    }, [audioUrl]);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onDragOver = useCallback((e) => {
        e.preventDefault();
    }, []);

    // Microphone recording
    const toggleRecording = useCallback(async () => {
        if (isRecording && mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
                handleFile(file);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            setError('Microphone access denied. Please allow microphone access to record.');
        }
    }, [isRecording, handleFile]);

    // Transcribe
    const transcribe = useCallback(async () => {
        if (!audioFile || !workerRef.current || !modelLoaded) return;

        setStatus('processing');
        setProgress(0);
        setResult('');
        setError('');
        setProgressText('Decoding audio...');

        try {
            const arrayBuffer = await audioFile.arrayBuffer();

            // Decode audio on main thread (OfflineAudioContext is NOT available in workers)
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            await audioCtx.close();

            // Resample to 16kHz mono using OfflineAudioContext
            const offlineCtx = new OfflineAudioContext(
                1,
                Math.ceil(audioBuffer.duration * 16000),
                16000
            );

            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start(0);

            const resampled = await offlineCtx.startRendering();
            const audioFloat32 = resampled.getChannelData(0);

            setProgressText('Sending to Whisper model...');

            // Transfer the buffer to the worker (zero-copy via transferable)
            workerRef.current.postMessage({
                type: 'transcribe',
                data: {
                    audioFloat32,
                    language: language === 'auto' ? null : language,
                    task: mode,
                },
            }, [audioFloat32.buffer]);
        } catch (err) {
            setError(`Audio decoding failed: ${err.message}`);
            setStatus('error');
        }
    }, [audioFile, modelLoaded, language, mode]);

    // Copy result
    const copyResult = useCallback(async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [result]);

    const isProcessing = status === 'loading' || status === 'processing';

    return (
        <div style={styles.wrapper}>
            {/* Model selection + loading section */}
            {!modelLoaded && status !== 'loading' && (
                <div style={styles.modelSection}>
                    <div style={styles.modelInfo}>
                        <h3 style={styles.modelTitle}>🤖 Choose a Whisper Model</h3>
                        <p style={styles.modelDesc}>
                            Select a model below. All models are downloaded and cached in your browser.
                            After the first download, they load instantly — even offline.
                        </p>
                    </div>

                    <div style={styles.modelGrid}>
                        {MODELS.map((m) => (
                            <button
                                key={m.id}
                                style={selectedModel === m.id ? styles.modelCardActive : styles.modelCard}
                                onClick={() => setSelectedModel(m.id)}
                            >
                                <div style={styles.modelCardLabel}>{m.label}</div>
                                <div style={styles.modelCardName}>{m.name}</div>
                                <div style={styles.modelCardMeta}>
                                    <span>{m.size}</span>
                                    <span style={styles.modelCardSpeed}>{m.speed}</span>
                                </div>
                                <div style={styles.modelCardDesc}>{m.description}</div>
                                {!m.multilingual && (
                                    <div style={styles.modelCardBadge}>English Only</div>
                                )}
                            </button>
                        ))}
                    </div>

                    <button style={styles.btnPrimary} onClick={loadModel}>
                        ⬇️ Download & Load {MODELS.find(m => m.id === selectedModel)?.name || 'Model'}
                    </button>
                </div>
            )}

            {/* Loading progress */}
            {status === 'loading' && (
                <div style={styles.progressSection}>
                    <p style={styles.progressLabel}>{progressText || 'Loading model...'}</p>
                    <div style={styles.progressBar}>
                        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                    </div>
                    <p style={styles.progressPercent}>{Math.round(progress)}%</p>
                    <button
                        style={{ ...styles.btnSecondary, marginTop: '1rem', width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
                        onClick={() => { setStatus('idle'); setProgress(0); setProgressText(''); }}
                    >
                        ← Back to model selection
                    </button>
                </div>
            )}

            {/* Main transcription UI */}
            {modelLoaded && (
                <>
                    {/* Controls */}
                    {/* Loaded model badge */}
                    <div style={styles.loadedBadge}>
                        ✅ {currentModelConfig?.name || 'Model'} loaded
                        <button
                            style={styles.switchModelBtn}
                            onClick={() => { setModelLoaded(false); setLoadedModelId(null); setStatus('idle'); setResult(''); }}
                        >
                            Switch model
                        </button>
                    </div>

                    <div style={styles.controls}>
                        <div style={styles.controlGroup}>
                            <label style={styles.label}>Mode</label>
                            <div style={styles.toggleGroup}>
                                <button
                                    style={mode === 'transcribe' ? styles.toggleActive : styles.toggle}
                                    onClick={() => setMode('transcribe')}
                                >
                                    📝 Transcribe
                                </button>
                                <button
                                    style={mode === 'translate' ? styles.toggleActive : styles.toggle}
                                    onClick={() => setMode('translate')}
                                >
                                    🌍 Translate to English
                                </button>
                            </div>
                        </div>

                        <div style={styles.controlGroup}>
                            <label style={styles.label}>Source Language {isEnglishOnly && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>(English only model)</span>}</label>
                            <select
                                style={{ ...styles.select, ...(isEnglishOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                                value={isEnglishOnly ? 'en' : language}
                                onChange={(e) => setLanguage(e.target.value)}
                                disabled={isEnglishOnly}
                            >
                                {LANGUAGES.map((l) => (
                                    <option key={l.code} value={l.code}>{l.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Upload area */}
                    <div
                        style={styles.dropzone}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*,video/*"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                        {audioFile ? (
                            <div style={styles.fileInfo}>
                                <span style={styles.fileIcon}>🎵</span>
                                <span style={styles.fileName}>{audioFile.name}</span>
                                <span style={styles.fileSize}>({(audioFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                            </div>
                        ) : (
                            <div style={styles.dropContent}>
                                <span style={styles.dropIcon}>📁</span>
                                <p style={styles.dropText}>Drop audio file here or click to browse</p>
                                <p style={styles.dropHint}>Supports WAV, MP3, M4A, FLAC, OGG, WebM</p>
                            </div>
                        )}
                    </div>

                    {/* Or record */}
                    <div style={styles.orDivider}>
                        <span style={styles.orLine}></span>
                        <span style={styles.orText}>OR</span>
                        <span style={styles.orLine}></span>
                    </div>

                    <button
                        style={isRecording ? styles.btnRecording : styles.btnSecondary}
                        onClick={toggleRecording}
                    >
                        {isRecording ? '⏹️ Stop Recording' : '🎤 Record from Microphone'}
                    </button>

                    {/* Audio preview */}
                    {audioUrl && (
                        <audio controls src={audioUrl} style={styles.audioPlayer} />
                    )}

                    {/* Transcribe button */}
                    <button
                        style={audioFile && !isProcessing ? styles.btnPrimary : styles.btnDisabled}
                        onClick={transcribe}
                        disabled={!audioFile || isProcessing}
                    >
                        {status === 'processing' ? '⏳ Processing...' : `🚀 ${mode === 'translate' ? 'Translate' : 'Transcribe'} Audio`}
                    </button>

                    {/* Processing progress */}
                    {status === 'processing' && (
                        <div style={styles.progressSection}>
                            <p style={styles.progressLabel}>{progressText || 'Processing audio...'}</p>
                            <div style={styles.processingAnimation}>
                                <div style={styles.processingDot} />
                                <div style={{ ...styles.processingDot, animationDelay: '0.2s' }} />
                                <div style={{ ...styles.processingDot, animationDelay: '0.4s' }} />
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div style={styles.resultSection}>
                            <div style={styles.resultHeader}>
                                <h3 style={styles.resultTitle}>
                                    {mode === 'translate' ? '🌍 Translation' : '📝 Transcription'}
                                </h3>
                                <button style={styles.copyBtn} onClick={copyResult}>
                                    {copied ? '✅ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                            <div style={styles.resultBox}>
                                <p style={styles.resultText}>{result}</p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div style={styles.errorBox}>
                            <p>❌ {error}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// -- Inline Styles (CSS-in-JS for the React island) --

const shared = {
    glass: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '1rem',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
    },
    fontSans: "'Inter', system-ui, -apple-system, sans-serif",
};

const styles = {
    wrapper: {
        maxWidth: 720,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        fontFamily: shared.fontSans,
    },

    modelSection: {
        ...shared.glass,
        padding: '2rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
    },

    modelInfo: {
        maxWidth: 500,
    },

    modelTitle: {
        color: '#f1f5f9',
        fontSize: '1.5rem',
        fontWeight: 700,
        marginBottom: '0.5rem',
        fontFamily: shared.fontSans,
    },

    modelDesc: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        lineHeight: 1.7,
        fontFamily: shared.fontSans,
    },

    progressSection: {
        ...shared.glass,
        padding: '2rem',
        textAlign: 'center',
    },

    progressLabel: {
        color: '#94a3b8',
        fontSize: '0.9rem',
        marginBottom: '1rem',
        fontFamily: shared.fontSans,
    },

    progressBar: {
        height: 8,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: '0.5rem',
    },

    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #6366f1, #818cf8, #f59e0b)',
        borderRadius: 4,
        transition: 'width 0.3s ease',
    },

    progressPercent: {
        color: '#818cf8',
        fontSize: '0.85rem',
        fontWeight: 600,
        fontFamily: shared.fontSans,
    },

    controls: {
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
    },

    controlGroup: {
        flex: 1,
        minWidth: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
    },

    label: {
        color: '#94a3b8',
        fontSize: '0.8rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontFamily: shared.fontSans,
    },

    toggleGroup: {
        display: 'flex',
        gap: '0.5rem',
    },

    toggle: {
        flex: 1,
        padding: '0.7rem 1rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '0.75rem',
        color: '#94a3b8',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: 500,
        fontFamily: shared.fontSans,
        transition: 'all 0.2s ease',
    },

    toggleActive: {
        flex: 1,
        padding: '0.7rem 1rem',
        background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '0.75rem',
        color: '#818cf8',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: 600,
        fontFamily: shared.fontSans,
        transition: 'all 0.2s ease',
    },

    select: {
        padding: '0.7rem 1rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '0.75rem',
        color: '#f1f5f9',
        fontSize: '0.9rem',
        fontFamily: shared.fontSans,
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
        paddingRight: '2rem',
    },

    dropzone: {
        ...shared.glass,
        padding: '3rem 2rem',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        borderStyle: 'dashed',
    },

    dropContent: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
    },

    dropIcon: {
        fontSize: '2.5rem',
        marginBottom: '0.5rem',
    },

    dropText: {
        color: '#f1f5f9',
        fontSize: '1rem',
        fontWeight: 500,
        fontFamily: shared.fontSans,
    },

    dropHint: {
        color: '#64748b',
        fontSize: '0.8rem',
        fontFamily: shared.fontSans,
    },

    fileInfo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
    },

    fileIcon: { fontSize: '1.5rem' },

    fileName: {
        color: '#f1f5f9',
        fontWeight: 600,
        fontFamily: shared.fontSans,
    },

    fileSize: {
        color: '#64748b',
        fontSize: '0.85rem',
        fontFamily: shared.fontSans,
    },

    orDivider: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
    },

    orLine: {
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.08)',
    },

    orText: {
        color: '#64748b',
        fontSize: '0.8rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontFamily: shared.fontSans,
    },

    btnPrimary: {
        padding: '1rem 2rem',
        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        color: 'white',
        border: 'none',
        borderRadius: '0.75rem',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: shared.fontSans,
        boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
        transition: 'all 0.25s ease',
        width: '100%',
    },

    btnSecondary: {
        padding: '1rem 2rem',
        background: 'rgba(255,255,255,0.04)',
        color: '#f1f5f9',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '0.75rem',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: shared.fontSans,
        transition: 'all 0.25s ease',
        width: '100%',
    },

    btnRecording: {
        padding: '1rem 2rem',
        background: 'rgba(239,68,68,0.15)',
        color: '#ef4444',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '0.75rem',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: shared.fontSans,
        transition: 'all 0.25s ease',
        width: '100%',
        animation: 'pulse 1.5s ease-in-out infinite',
    },

    btnDisabled: {
        padding: '1rem 2rem',
        background: 'rgba(255,255,255,0.04)',
        color: '#64748b',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: '0.75rem',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'not-allowed',
        fontFamily: shared.fontSans,
        width: '100%',
    },

    audioPlayer: {
        width: '100%',
        borderRadius: '0.75rem',
        background: 'rgba(255,255,255,0.04)',
    },

    processingAnimation: {
        display: 'flex',
        justifyContent: 'center',
        gap: '0.5rem',
        marginTop: '1rem',
    },

    processingDot: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: '#818cf8',
        animation: 'bounce 0.8s ease-in-out infinite',
    },

    resultSection: {
        ...shared.glass,
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },

    resultHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    resultTitle: {
        color: '#f1f5f9',
        fontSize: '1.1rem',
        fontWeight: 700,
        fontFamily: shared.fontSans,
    },

    copyBtn: {
        padding: '0.4rem 1rem',
        background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '0.5rem',
        color: '#818cf8',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: shared.fontSans,
        transition: 'all 0.2s ease',
    },

    resultBox: {
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        maxHeight: 400,
        overflowY: 'auto',
    },

    resultText: {
        color: '#e2e8f0',
        fontSize: '1rem',
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
        fontFamily: shared.fontSans,
    },

    errorBox: {
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '0.75rem',
        padding: '1rem 1.5rem',
        color: '#fca5a5',
        fontSize: '0.9rem',
        fontFamily: shared.fontSans,
    },

    modelGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
        width: '100%',
    },

    modelCard: {
        ...shared.glass,
        padding: '1.25rem',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
    },

    modelCardActive: {
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.4)',
        borderRadius: '1rem',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '1.25rem',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        boxShadow: '0 0 20px rgba(99,102,241,0.15)',
    },

    modelCardLabel: {
        fontSize: '1.1rem',
        fontWeight: 700,
        fontFamily: shared.fontSans,
        color: '#f1f5f9',
    },

    modelCardName: {
        fontSize: '0.8rem',
        color: '#94a3b8',
        fontWeight: 600,
        fontFamily: shared.fontSans,
    },

    modelCardMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: '#64748b',
        fontFamily: shared.fontSans,
    },

    modelCardSpeed: {
        color: '#34d399',
        fontWeight: 600,
    },

    modelCardDesc: {
        fontSize: '0.75rem',
        color: '#64748b',
        lineHeight: 1.5,
        fontFamily: shared.fontSans,
    },

    modelCardBadge: {
        marginTop: '0.25rem',
        fontSize: '0.65rem',
        fontWeight: 700,
        color: '#f59e0b',
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: '0.5rem',
        padding: '0.15rem 0.5rem',
        alignSelf: 'flex-start',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontFamily: shared.fontSans,
    },

    loadedBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '0.75rem 1.5rem',
        background: 'rgba(52,211,153,0.08)',
        border: '1px solid rgba(52,211,153,0.2)',
        borderRadius: '0.75rem',
        color: '#34d399',
        fontSize: '0.9rem',
        fontWeight: 600,
        fontFamily: shared.fontSans,
    },

    switchModelBtn: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        padding: '0.3rem 0.75rem',
        color: '#94a3b8',
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: shared.fontSans,
        transition: 'all 0.2s ease',
    },
};
