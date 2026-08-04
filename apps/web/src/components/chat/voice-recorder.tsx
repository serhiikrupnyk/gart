'use client';

import { useEffect, useRef, useState } from 'react';
import { VOICE_MAX_SECONDS } from '@gart/shared';
import { Mic } from 'lucide-react';

import { Button } from '@/components/ui';

function elapsed(seconds: number): string {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

export function recordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    navigator.mediaDevices !== undefined
  );
}

/**
 * Tap to start, tap to send, with an explicit cancel — the same gesture on a
 * trackpad and a phone, and a slipped finger cannot destroy a recording
 * mid-sentence. Recording stops itself at VOICE_MAX_SECONDS; a chat note is
 * not a podcast.
 *
 * If the browser cannot record, or the microphone is refused, the control
 * simply is not offered — the same treatment push permission gets.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (audio: Blob, seconds: number) => void;
  disabled: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!recording) {
      return;
    }

    const timer = setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [recording]);

  useEffect(() => {
    if (seconds >= VOICE_MAX_SECONDS) {
      recorderRef.current?.stop();
    }
  }, [seconds]);

  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => {
        track.stop();
      });
    },
    [],
  );

  async function start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // The microphone light must go out the moment recording ends.
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        setRecording(false);

        const captured = chunksRef.current;

        if (!cancelledRef.current && captured.length > 0) {
          onRecorded(new Blob(captured, { type: recorder.mimeType }), Math.max(seconds, 1));
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
    } catch {
      // Refused or unavailable: stop offering something that cannot work.
      setUnavailable(true);
    }
  }

  if (unavailable) {
    return null;
  }

  if (!recording) {
    return (
      <Button
        variant="secondary"
        disabled={disabled}
        aria-label="Записати голосове повідомлення"
        onClick={() => void start()}
      >
        <Mic className="size-5" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm tabular-nums text-danger">
        <span aria-hidden="true" className="inline-block size-2 rounded-full bg-danger" />{' '}
        {elapsed(seconds)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Скасувати запис"
        onClick={() => {
          cancelledRef.current = true;
          recorderRef.current?.stop();
        }}
      >
        Скасувати
      </Button>
      <Button
        variant="primary"
        size="sm"
        aria-label="Надіслати голосове повідомлення"
        onClick={() => {
          recorderRef.current?.stop();
        }}
      >
        Готово
      </Button>
    </div>
  );
}
