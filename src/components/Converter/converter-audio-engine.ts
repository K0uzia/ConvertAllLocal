import { Mp3Encoder } from '@breezystack/lamejs';
import type { OutputFormatOption } from '../../data/converter-output-formats.js';
import { ConvertError, validateFileWeight } from './converter-errors.js';
import type { ConvertResult, ProgressCallback } from './converter-image-engine.js';

const MP3_SAMPLE_RATES = [44100, 48000, 32000, 22050, 24000, 16000, 12000, 11025, 8000] as const;

function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function inputExt(file: File): string {
  const match = file.name.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isOggVorbisInput(file: File): boolean {
  const ext = inputExt(file);
  if (ext === 'ogg' || ext === 'oga') return true;
  const mime = file.type.toLowerCase();
  return mime === 'audio/ogg' || mime === 'application/ogg';
}

function pcmToAudioBuffer(channelData: Float32Array[], samplesDecoded: number, sampleRate: number): AudioBuffer {
  const channels = channelData.length;
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(channels, samplesDecoded, sampleRate);
  for (let ch = 0; ch < channels; ch += 1) {
    buffer.copyToChannel(channelData[ch].subarray(0, samplesDecoded), ch);
  }
  void ctx.close();
  return buffer;
}

let oggDecoder: import('@wasm-audio-decoders/ogg-vorbis').OggVorbisDecoder | null = null;
let oggOpusDecoder: import('ogg-opus-decoder').OggOpusDecoder | null = null;

async function decodeOggVorbis(file: File): Promise<AudioBuffer> {
  const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis');
  if (!oggDecoder) {
    oggDecoder = new OggVorbisDecoder();
    await oggDecoder.ready;
  } else {
    await oggDecoder.reset();
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { channelData, samplesDecoded, sampleRate } = await oggDecoder.decodeFile(data);
    if (!samplesDecoded || channelData.length === 0) {
      throw new Error('empty_ogg_decode');
    }
    return pcmToAudioBuffer(channelData, samplesDecoded, sampleRate);
  } catch {
    throw new Error('ogg_vorbis_failed');
  }
}

async function decodeOggOpus(file: File): Promise<AudioBuffer> {
  const { OggOpusDecoder } = await import('ogg-opus-decoder');
  if (!oggOpusDecoder) {
    oggOpusDecoder = new OggOpusDecoder();
    await oggOpusDecoder.ready;
  } else {
    await oggOpusDecoder.reset();
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { channelData, samplesDecoded, sampleRate } = await oggOpusDecoder.decodeFile(data);
    if (!samplesDecoded || channelData.length === 0) {
      throw new Error('empty_opus_decode');
    }
    return pcmToAudioBuffer(channelData, samplesDecoded, sampleRate);
  } catch {
    throw new Error('ogg_opus_failed');
  }
}

async function decodeOggContainer(file: File): Promise<AudioBuffer> {
  try {
    return await decodeOggVorbis(file);
  } catch {
    try {
      return await decodeOggOpus(file);
    } catch {
      throw ConvertError.audioUnreadable();
    }
  }
}

async function decodeWithWebAudio(file: File): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    const buffer = await file.arrayBuffer();
    return await context.decodeAudioData(buffer.slice(0));
  } finally {
    await context.close();
  }
}

async function decodeAudio(file: File): Promise<AudioBuffer> {
  const oggInput = isOggVorbisInput(file);

  if (oggInput) {
    try {
      return await decodeOggContainer(file);
    } catch {
      /* repli Web Audio ci-dessous */
    }
  }

  try {
    return await decodeWithWebAudio(file);
  } catch {
    if (oggInput) {
      try {
        return await decodeOggContainer(file);
      } catch {
        /* ignore */
      }
    }
    throw ConvertError.audioUnreadable();
  }
}

function downmixToStereo(audioBuffer: AudioBuffer): AudioBuffer {
  const channels = audioBuffer.numberOfChannels;
  if (channels <= 2) return audioBuffer;

  const ctx = new AudioContext();
  const out = ctx.createBuffer(2, audioBuffer.length, audioBuffer.sampleRate);
  out.copyToChannel(audioBuffer.getChannelData(0), 0);
  out.copyToChannel(audioBuffer.getChannelData(1), 1);
  void ctx.close();
  return out;
}

async function resampleForMp3(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const rate = audioBuffer.sampleRate;
  if ((MP3_SAMPLE_RATES as readonly number[]).includes(rate)) {
    return audioBuffer;
  }

  const target = 44100;
  const length = Math.max(1, Math.ceil(audioBuffer.duration * target));
  const offline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    target,
  );
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

async function encodeMp3(audioBuffer: AudioBuffer): Promise<ArrayBuffer> {
  const stereo = downmixToStereo(audioBuffer);
  const prepared = await resampleForMp3(stereo);
  const channels = Math.min(prepared.numberOfChannels, 2);
  const left = prepared.getChannelData(0);
  const right = channels > 1 ? prepared.getChannelData(1) : left;
  const sampleRate = prepared.sampleRate;

  const toInt16 = (input: Float32Array): Int16Array => {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const left16 = toInt16(left);
  const right16 = toInt16(right);
  const encoder = new Mp3Encoder(channels, sampleRate, 128);
  const blockSize = 1152;
  const mp3Chunks: Int8Array[] = [];

  for (let i = 0; i < left16.length; i += blockSize) {
    const leftChunk = left16.subarray(i, i + blockSize);
    const rightChunk = right16.subarray(i, i + blockSize);
    const mp3buf =
      channels === 2
        ? encoder.encodeBuffer(leftChunk, rightChunk)
        : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }

  const end = encoder.flush();
  if (end.length > 0) mp3Chunks.push(end);

  const total = mp3Chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (total === 0) {
    throw new Error('empty_mp3');
  }

  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of mp3Chunks) {
    out.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length), pos);
    pos += chunk.length;
  }
  return out.buffer;
}

async function encodeOgg(audioBuffer: AudioBuffer): Promise<ArrayBuffer> {
  const channels = audioBuffer.numberOfChannels;
  if (channels > 2) {
    throw ConvertError.encodeFailed('OGG');
  }

  const { createOggEncoder } = await import('wasm-media-encoders');
  const encoder = await createOggEncoder();
  encoder.configure({
    sampleRate: audioBuffer.sampleRate,
    channels,
    vbrQuality: 4,
  });

  const samples: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) {
    samples.push(audioBuffer.getChannelData(ch));
  }

  const chunks: Uint8Array[] = [];
  const append = (block: Uint8Array): void => {
    if (block.length > 0) chunks.push(new Uint8Array(block));
  };

  append(encoder.encode(samples));
  append(encoder.finalize());

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out.buffer;
}

export function validateAudioFile(file: File): void {
  validateFileWeight(file);
}

export async function convertAudioFile(
  file: File,
  output: OutputFormatOption,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateAudioFile(file);
  onProgress(0.1);
  const audioBuffer = await decodeAudio(file);
  onProgress(0.5);

  let encoded: ArrayBuffer;
  if (output.id === 'wav') {
    encoded = encodeWav(audioBuffer);
  } else if (output.id === 'mp3') {
    try {
      encoded = await encodeMp3(audioBuffer);
    } catch {
      throw ConvertError.encodeFailed('MP3');
    }
  } else if (output.id === 'ogg') {
    try {
      encoded = await encodeOgg(audioBuffer);
    } catch (err) {
      if (err instanceof ConvertError) throw err;
      throw ConvertError.encodeFailed('OGG');
    }
  } else {
    throw ConvertError.encodeFailed(output.label);
  }

  onProgress(1);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'converti';
  return {
    blob: new Blob([encoded], { type: output.mime }),
    mime: output.mime,
    filename: `${baseName}.${output.extension}`,
  };
}
