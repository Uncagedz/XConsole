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

const SpeechRecognition =
  (window as typeof window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
  (window as typeof window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;

const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const useButton = document.querySelector<HTMLButtonElement>('#use')!;
const closeButton = document.querySelector<HTMLButtonElement>('#close')!;
const transcriptBox = document.querySelector<HTMLTextAreaElement>('#transcript')!;
const statusText = document.querySelector<HTMLElement>('#status')!;

let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
let finalTranscript = '';
let interimTranscript = '';

function setStatus(value: string) {
  statusText.textContent = value;
}

function sendMessage(message: Record<string, unknown>) {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

function publishTranscript(transcript: string) {
  sendMessage({ type: 'MIC_TRANSCRIPT_UPDATE', transcript });
}

function publishState(state: string, transcript = currentTranscript()) {
  sendMessage({ type: 'MIC_STATE', state, transcript });
}

function publishError(error: string) {
  sendMessage({ type: 'MIC_ERROR', error });
}

function currentTranscript() {
  return `${finalTranscript} ${interimTranscript}`.trim();
}

async function getCurrentMicPermissionState() {
  try {
    const permission = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });

    return permission.state;
  } catch {
    return 'unknown';
  }
}

async function requestMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this browser window.');
  }

  const beforeState = await getCurrentMicPermissionState();

  if (beforeState === 'denied') {
    throw new Error(
      'Microphone permission is denied for this extension page. Remove the blocked chrome-extension entry in Chrome microphone settings, reload the extension, then try again.',
    );
  }

  setStatus('Chrome is requesting microphone permission...');
  publishState('requesting_permission');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  stream.getTracks().forEach((track) => track.stop());

  const afterState = await getCurrentMicPermissionState();

  if (afterState === 'denied') {
    throw new Error('Microphone permission was denied.');
  }

  return true;
}

function resetButton() {
  startButton.textContent = 'Start Listening';
  startButton.disabled = false;
}

function stop() {
  try {
    recognition?.stop();
  } catch {
    // ignore
  }

  recognition = null;
  interimTranscript = '';
  resetButton();

  const transcript = currentTranscript();

  setStatus(transcript ? 'Stopped. Review it, then use this context.' : 'Stopped.');
  publishTranscript(transcript);
  publishState('stopped', transcript);
}

async function start() {
  if (!SpeechRecognition) {
    const message = 'Speech recognition is not available in this browser.';
    setStatus(message);
    publishError(message);
    return;
  }

  if (recognition) {
    stop();
    return;
  }

  try {
    startButton.disabled = true;
    setStatus('Checking microphone permission...');
    publishState('checking_permission');

    await requestMicPermission();

    finalTranscript = transcriptBox.value.trim();
    interimTranscript = '';

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      interimTranscript = '';

      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';

        if (result?.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      const transcript = currentTranscript();
      transcriptBox.value = transcript;

      publishTranscript(transcript);
      publishState('listening', transcript);
    };

    recognition.onerror = (event: any) => {
      const error = event?.error ? String(event.error) : 'unknown';

      let message = `Mic error: ${error}`;

      if (error === 'not-allowed' || error === 'service-not-allowed') {
        message =
          'Mic blocked for this extension page. Open chrome://settings/content/microphone, remove the blocked chrome-extension entry, reload the extension, then open this mic page again.';
      } else if (error === 'no-speech') {
        message = 'No speech detected. Try again and speak clearly.';
      } else if (error === 'audio-capture') {
        message = 'Chrome cannot access your microphone device. Check that the mic is selected and not being used by another app.';
      } else if (error === 'network') {
        message = 'Speech recognition network error. Try again.';
      }

      recognition = null;
      resetButton();

      setStatus(message);
      publishError(message);
      publishState('error', currentTranscript());
    };

    recognition.onend = () => {
      recognition = null;
      interimTranscript = '';

      resetButton();

      const transcript = currentTranscript();

      publishTranscript(transcript);
      publishState('stopped', transcript);

      if (statusText.textContent === 'Listening...') {
        setStatus(transcript ? 'Stopped. Review it, then use this context.' : 'Stopped. Try again if nothing came through.');
      }
    };

    recognition.start();

    startButton.textContent = 'Stop Listening';
    startButton.disabled = false;

    setStatus('Listening...');
    publishState('listening', '');
  } catch (error) {
    recognition = null;
    resetButton();

    const message = error instanceof Error ? error.message : 'Microphone permission denied.';

    setStatus(`Mic blocked: ${message}`);
    publishError(message);
    publishState('error', currentTranscript());
  }
}

startButton.addEventListener('click', () => {
  start().catch((error) => {
    const message = error instanceof Error ? error.message : 'Mic failed to start. Check Chrome microphone permissions.';

    setStatus(message);
    publishError(message);
    publishState('error', currentTranscript());
    resetButton();
  });
});

useButton.addEventListener('click', () => {
  if (recognition) stop();

  const transcript = transcriptBox.value.trim();

  publishTranscript(transcript);
  publishState('stopped', transcript);

  window.close();
});

closeButton.addEventListener('click', () => {
  if (recognition) stop();
  window.close();
});

setStatus('Ready. Click Start Listening and allow microphone access.');
publishState('ready', '');
