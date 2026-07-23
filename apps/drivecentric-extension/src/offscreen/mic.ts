type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export {};

type OffscreenMicRequest =
  | { type: 'OFFSCREEN_MIC_START' }
  | { type: 'OFFSCREEN_MIC_STOP' };

const SpeechRecognition =
  (
    window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    }
  ).SpeechRecognition ??
  (
    window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    }
  ).webkitSpeechRecognition;

let recognition: InstanceType<SpeechRecognitionCtor> | null = null;

let finalTranscript = '';
let interimTranscript = '';

function publish(
  type:
    | 'MIC_TRANSCRIPT_UPDATE'
    | 'MIC_STATE'
    | 'MIC_ERROR',
  payload: Record<string, unknown>,
) {
  chrome.runtime.sendMessage({
    type,
    ...payload,
  }).catch(() => undefined);
}

function currentTranscript() {
  return `${finalTranscript} ${interimTranscript}`.trim();
}

async function requestMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone access is not available in this browser window.',
    );
  }

  publish('MIC_STATE', {
    state: 'requesting_browser_permission',
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // IMPORTANT:
  // Permission is now granted.
  // Stop temporary stream immediately.
  stream.getTracks().forEach((track) => track.stop());

  return true;
}

function stopMic() {
  try {
    recognition?.stop();
  } catch {
    // ignore
  }

  recognition = null;

  publish('MIC_STATE', {
    state: 'stopped',
    transcript: currentTranscript(),
  });

  return currentTranscript();
}

async function startMic() {
  if (!SpeechRecognition) {
    publish('MIC_ERROR', {
      error:
        'Speech recognition is not available in this browser.',
    });

    return false;
  }

  if (recognition) {
    stopMic();
  }

  try {
    publish('MIC_STATE', {
      state: 'requesting_permission',
      transcript: currentTranscript(),
    });

    // THIS IS THE IMPORTANT FIX
    await requestMicPermission();

    finalTranscript = '';
    interimTranscript = '';

    recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      interimTranscript = '';

      for (
        let index = event.resultIndex ?? 0;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];

        const transcript =
          result?.[0]?.transcript ?? '';

        if (result?.isFinal) {
          finalTranscript =
            `${finalTranscript} ${transcript}`.trim();
        } else {
          interimTranscript =
            `${interimTranscript} ${transcript}`.trim();
        }
      }

      publish('MIC_TRANSCRIPT_UPDATE', {
        transcript: currentTranscript(),
      });
    };

    recognition.onerror = (event: any) => {
      const error =
        event?.error
          ? String(event.error)
          : 'Microphone failed.';

      recognition = null;

      console.error(
        '[Closer AI] SpeechRecognition error:',
        error,
      );

      publish('MIC_ERROR', {
        error:
          error === 'not-allowed' ||
          error === 'service-not-allowed'
            ? 'Chrome blocked microphone permission. Open the extension mic window directly and click Allow.'
            : error,
      });
    };

    recognition.onend = () => {
      recognition = null;

      publish('MIC_STATE', {
        state: 'stopped',
        transcript: currentTranscript(),
      });
    };

    // START AFTER PERMISSION
    recognition.start();

    publish('MIC_STATE', {
      state: 'listening',
      transcript: '',
    });

    return true;
  } catch (error) {
    recognition = null;

    console.error(
      '[Closer AI] Mic permission error:',
      error,
    );

    publish('MIC_ERROR', {
      error:
        error instanceof Error
          ? error.message
          : 'Microphone permission blocked.',
    });

    return false;
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: OffscreenMicRequest,
    _sender,
    sendResponse,
  ) => {
    if (message.type === 'OFFSCREEN_MIC_START') {
      startMic()
        .then((started) => {
          sendResponse({ started });
        })
        .catch((error) => {
          sendResponse({
            started: false,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          });
        });

      return true;
    }

    if (message.type === 'OFFSCREEN_MIC_STOP') {
      sendResponse({
        stopped: true,
        transcript: stopMic(),
      });

      return true;
    }

    return false;
  },
);
