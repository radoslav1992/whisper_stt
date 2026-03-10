import { pipeline } from '@huggingface/transformers';

let transcriber = null;

// Listen for messages from the main thread
self.onmessage = async function (e) {
    const { type, data } = e.data;

    switch (type) {
        case 'load-model':
            await loadModel(data);
            break;
        case 'transcribe':
            await transcribeAudio(data);
            break;
    }
};

async function loadModel(data) {
    const modelId = data?.modelId || 'Xenova/whisper-base';

    try {
        self.postMessage({
            type: 'status',
            data: { message: `Initializing ${modelId}...` },
        });

        // Terminate previous pipeline if switching models
        transcriber = null;

        transcriber = await pipeline(
            'automatic-speech-recognition',
            modelId,
            {
                dtype: 'q8',
                device: 'wasm',
                progress_callback: (progressData) => {
                    // Handle all progress event formats from @huggingface/transformers
                    if (progressData.status === 'progress') {
                        const pct = progressData.progress || 0;
                        const fileName = progressData.file || '';
                        self.postMessage({
                            type: 'progress',
                            data: {
                                progress: pct,
                                message: `Downloading ${fileName}... ${Math.round(pct)}%`,
                            },
                        });
                    } else if (progressData.status === 'download') {
                        // Download starting for a file
                        const fileName = progressData.file || 'model files';
                        self.postMessage({
                            type: 'status',
                            data: { message: `Starting download: ${fileName}...` },
                        });
                    } else if (progressData.status === 'done') {
                        const fileName = progressData.file || '';
                        self.postMessage({
                            type: 'status',
                            data: { message: `Downloaded ${fileName}` },
                        });
                    } else if (progressData.status === 'loading' || progressData.status === 'initiate') {
                        const fileName = progressData.file || '';
                        self.postMessage({
                            type: 'status',
                            data: { message: `Loading ${fileName}...` },
                        });
                    } else if (progressData.status === 'ready') {
                        self.postMessage({
                            type: 'status',
                            data: { message: 'Model ready!' },
                        });
                    }
                },
            }
        );

        self.postMessage({ type: 'model-loaded', data: {} });
    } catch (err) {
        self.postMessage({
            type: 'error',
            data: { message: `Failed to load model: ${err.message}` },
        });
    }
}

async function transcribeAudio({ audioFloat32, language, task }) {
    if (!transcriber) {
        self.postMessage({
            type: 'error',
            data: { message: 'Model not loaded. Please load the model first.' },
        });
        return;
    }

    try {
        self.postMessage({
            type: 'status',
            data: { message: 'Transcribing audio... This may take a moment.' },
        });

        // audioFloat32 is already a Float32Array at 16kHz mono (decoded on main thread)
        const options = {
            chunk_length_s: 30,
            stride_length_s: 5,
            task: task || 'transcribe',
            return_timestamps: false,
        };

        if (language) {
            options.language = language;
        }

        const result = await transcriber(audioFloat32, options);

        self.postMessage({
            type: 'result',
            data: { text: result.text },
        });
    } catch (err) {
        self.postMessage({
            type: 'error',
            data: { message: `Transcription failed: ${err.message}` },
        });
    }
}
